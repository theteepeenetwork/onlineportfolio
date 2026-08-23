import "server-only";
import {
  ActivityInputError,
  MAX_PAGES,
  createActivity,
  getActivity,
  listActivities,
  listFolders,
  updateActivity,
} from "./activities";
import { QUESTIONS_PER_PAGE } from "./quizLayout";
import { MAX_IMAGE_BYTES, MAX_REGIONS, persistAsset } from "./media";
import { MAX_OPTION_TEXT_LEN, MAX_OPTIONS, MAX_PROMPT_LEN, MIN_OPTIONS } from "@/lib/quiz";
import { MAX_TEXT_LEN } from "@/lib/canvasObjects";
import type { ApiTeacher } from "./tokens";

// The Model Context Protocol server: the surface Claude actually talks to.
//
// It is a thin translation layer and nothing more. Every tool below calls
// straight into src/lib/api/activities.ts, which is where the tenant scoping
// lives, so this file cannot widen what a token can reach — the worst a bug
// here can do is refuse a call that should have worked.
//
// Transport is Streamable HTTP: one endpoint, JSON-RPC 2.0 in the POST body,
// JSON in the response. Deliberately stateless — no Mcp-Session-Id, no
// server-initiated stream. There is nothing to push (a template does not change
// on its own) and a stateless server survives a restart, a second instance and
// a dropped connection without a teacher having to reconnect anything.

// Protocol revisions this server knows how to speak, newest first. An
// `initialize` naming one of these is answered with the same revision; anything
// else is answered with the newest we know, and the client decides whether it
// can live with that. That is what the spec asks for, and it is why a client
// released after this code was written still connects.
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"];

const SERVER_INFO = { name: "storyjar", title: "StoryJar", version: "1.0.0" };

// Shown to the model once, at connection. This is the only place to say the
// things that are true about the whole connector rather than about one tool.
//
// IT ALSO CARRIES A FULL FIELD REFERENCE, which looks like duplication of the
// schemas below and is not. `initialize` is answered fresh on every connection;
// `tools/list` is commonly cached by the client, sometimes for weeks. On
// 21 Aug 2026 a teacher spent a morning against a tool list cached from before
// `page_content`, `image` and `upload_asset` existed — the server had them, the
// client did not, and there was no way to find that out from inside the
// conversation. Anything a caller cannot do their job without is therefore said
// HERE as well, in prose the model reads whatever its cached schemas say.
const INSTRUCTIONS = `StoryJar holds the activities a primary-school teacher sets for their class.

Through this connector you can read, create and edit the activities in ONE teacher's own library. A common job is turning a worksheet the teacher shows you into a multi-page quiz: read the worksheet, write the questions, and call create_activity.

Two things to tell the teacher, because they are not obvious:

1. Nothing you make here reaches a child on its own. You are building an activity in the teacher's library; they open it in StoryJar, look at it, and choose whether to set it for a class. Always finish by giving them the link this connector returns.
2. You cannot see classes, pupils, pupils' work, or anything in the approval queue through this connector, and there is no setting that changes that. If a teacher asks you for any of it, tell them it is in StoryJar itself.

TOOLS: list_activities, get_activity, create_activity, update_activity, upload_asset, list_folders. If your tool list is missing any of those, it is out of date — ask the teacher to remove and re-add the StoryJar connector, because no payload you write will work until it is refreshed.

FIELDS, in full, because a cached tool list may not show them:

create_activity / update_activity take title, instructions, tags, folder_id, pages, page_content, questions (and update_activity also takes activity_id and archived).

- pages is a NUMBER: how many pages the activity has. It never describes what is on them.
- page_content is a LIST, one entry per page, page 1 first. Each entry is {heading?, passage?, image?}. This is where a body of text goes: a passage a child reads before answering, up to ${MAX_TEXT_LEN} characters, laid out and sized to fit the page for you. An entry may be empty ({}) to leave a page as it is.
- questions is a LIST of {prompt, options, correct, page?, image?}.
  - prompt: the question, at most ${MAX_PROMPT_LEN} characters. This cap is deliberate. A passage a child has to read belongs in page_content, not in the question asking about it.
  - options: ${MIN_OPTIONS} to ${MAX_OPTIONS} answers. Each is either a plain string (at most ${MAX_OPTION_TEXT_LEN} characters) or {text?, image?} for a picture answer.
  - correct: which option is right, counting from 0.
  - page: 1-based, and only when the question genuinely belongs on a particular page.
  - image: a picture that belongs WITH the question — the extract it asks about. It is placed beside the question, never behind it.
- instructions is one or two sentences, at most 500 characters. It is read aloud to younger children and shown under the title. It is not a place for a passage; use page_content.

A PICTURE, anywhere one is accepted, is an object: {source, alt} or {asset_id, alt}.
- source is the picture itself as a data:image URL — data:image/png;base64,... — PNG, JPEG or WebP. StoryJar does not fetch pictures from web addresses, so an https URL is refused, not downloaded. If you have just cropped a page out of a PDF you already have the bytes, which is the case this is built for.
- asset_id is an id from upload_asset, for the same picture used in several places.
- alt says what the picture shows, for a child who cannot see it. Required whenever you send source.
- At most ${(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB per picture and 10 MB per activity.

PAGE LAYOUT is done for you, and it decides how many pages you get: ${QUESTIONS_PER_PAGE} plain questions to a page; half that on a page carrying a heading or a passage; two on a page whose questions have pictures. Send the questions in the order a child should meet them and let them fall. A question's picture is placed beside it at its own shape, never stretched to fill the space.

SPLITTING A WORKSHEET INTO PAGES is the common job, and it has one shape. Say a teacher shows you an A4 sheet with four number-bond models on it and wants a four-page activity:

1. Rasterise each sheet of paper to a PNG. (StoryJar does not take PDFs — if you cannot turn the PDF into pictures, say so and tell the teacher they can import the PDF themselves in the StoryJar activity builder, which does the same thing.)
2. Call upload_asset ONCE per sheet, passing \`regions\`: one rectangle per question, each given as FRACTIONS of that sheet — {x: 0, y: 0, w: 0.5, h: 0.5} is the top-left quarter — with an \`alt\` saying what that part shows. You get back one asset_id per region. The sheet travels once, not once per question, and it is cut up here.
3. Put each region on its question as \`image\`, and give that question its own \`page\`.

The child then gets one question per page with the piece of worksheet it is about, beside it.

DO NOT instead put the whole sheet on every page as page_content. A page image sits BEHIND the question boxes and the questions cover the work; page_content's picture is for a page a child draws or writes on, not one they answer questions on.

Regions are cut from PNG only. JPEG and WebP are still fine as pictures — they just cannot be cut up, and you will be told so rather than left guessing.

WHAT COMES BACK from a write tells you what was actually stored — pages, questionCount and pictures. Check pictures against the number you sent: if they do not match, say so rather than telling the teacher it worked.

NOTHING IS IGNORED. A field this connector does not know is refused, with the fields it does know listed in the refusal, and nothing is saved. A type error tells you what actually arrived. So if a call is refused with something that looks impossible — a list you certainly sent reported as a string — the tool list your client is working from is stale, and re-adding the connector is the fix.`;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// A picture. Either the bytes themselves, or an id from upload_asset when the
// same picture is wanted in more than one place.
//
// `alt` is required, not optional. A caller writing a comprehension question has
// the words for what the extract shows; a child using a screen reader has
// nothing without them (SAFEGUARDING rule 18). Requiring it of an agent costs a
// sentence and is the only moment anyone is in a position to write it.
const imageSchema = {
  type: "object",
  properties: {
    source: {
      type: "string",
      description:
        "The picture itself, as a data:image URL (PNG, JPEG or WebP) — what you have after cropping or generating one. StoryJar does not fetch pictures from web addresses.",
    },
    asset_id: { type: "string", description: "Instead of `source`: an id from upload_asset, to reuse a picture you already sent." },
    alt: { type: "string", maxLength: 300, description: "What the picture shows, for a child who cannot see it. Required." },
  },
  required: ["alt"],
  additionalProperties: false,
} as const;

const questionSchema = {
  type: "object",
  properties: {
    // maxLength comes from the validator's own constant rather than a repeated
    // literal, so the schema and the refusal can never disagree. Stating it here
    // is the point: a model that only learns the limit from a rejection has
    // already composed the whole payload by then.
    prompt: { type: "string", maxLength: MAX_PROMPT_LEN, description: "The question, in words a child of the right age can read." },
    options: {
      type: "array",
      items: {
        anyOf: [
          { type: "string", maxLength: MAX_OPTION_TEXT_LEN },
          {
            type: "object",
            properties: {
              text: { type: "string", maxLength: MAX_OPTION_TEXT_LEN },
              image: imageSchema,
            },
            additionalProperties: false,
          },
        ],
      },
      minItems: MIN_OPTIONS,
      maxItems: MAX_OPTIONS,
      description: "The answers to choose from. Between two and four.",
    },
    correct: {
      type: "integer",
      description: "Which answer is right, as a position in `options` counting from 0.",
    },
    image: {
      ...imageSchema,
      description: "Optional. A picture that goes with this question — the extract it asks about. It is placed beside the question box, and a page holding picture questions holds two of them.",
    },
    page: {
      type: "integer",
      description:
        "Optional. The page this question belongs on, counting from 1. Leave it out and questions are dealt out in order, four to a page — which is how you get a multi-page quiz from a flat list.",
    },
  },
  required: ["prompt", "options", "correct"],
  additionalProperties: false,
} as const;

const activityFields = {
  title: { type: "string", maxLength: 120, description: "What the teacher will see on the card, e.g. \"Tuesday's number bonds\"." },
  instructions: { type: "string", description: "What to do. Read aloud to younger children, so keep it to a sentence or two." },
  tags: { type: "array", items: { type: "string" }, description: "Teacher's own labels, e.g. [\"Maths\", \"Year 2\"]." },
  folder_id: { type: "string", description: "Optional folder to file it in. Get ids from list_folders." },
  page_content: {
    type: "array",
    description:
      "What each page carries besides its questions — the \"read this, then answer\" half of a worksheet. Entry 1 is page 1. A page with a heading or a passage gives its top half to that text and holds half as many questions.",
    items: {
      type: "object",
      properties: {
        heading: { type: "string", maxLength: 120, description: "A title across the top of the page." },
        passage: {
          type: "string",
          maxLength: MAX_TEXT_LEN,
          description: "Text for a child to read on this page. This is where a passage goes — question prompts are capped at 300 characters and are not the place for one.",
        },
        image: { ...imageSchema, description: "A picture filling the page — a scanned or cropped worksheet page, for instance." },
      },
      additionalProperties: false,
    },
  },
  pages: {
    type: "integer",
    description: `Optional. Force a page count. Leave it out and the activity gets exactly as many pages as the questions need (at most ${MAX_PAGES}).`,
  },
} as const;

type ToolHandler = (teacher: ApiTeacher, args: Record<string, unknown>, origin: string) => Promise<unknown>;

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // Whether the tool changes anything. Clients use this to decide what to
  // confirm with the person before running, so it is worth being honest about.
  readOnly: boolean;
  handler: ToolHandler;
};

// Turn a stored activity into what the model should see: the summary, plus an
// absolute link the teacher can click, plus a sentence about live runs when
// there are any (see updateActivity — the API does not touch them).
function present(summary: { path: string; liveRuns: number }, origin: string) {
  const { liveRuns, ...rest } = summary;
  return {
    ...rest,
    url: `${origin}${summary.path}`,
    live_runs: liveRuns,
    ...(liveRuns > 0
      ? {
          note: `This activity is set with ${liveRuns} class${liveRuns === 1 ? "" : "es"} right now. Those classes keep the version they were given — changes made here apply to the library copy, and the teacher can set it again when they are ready.`,
        }
      : {}),
  };
}

const TOOLS: ToolDef[] = [
  {
    name: "list_activities",
    title: "List activities",
    description:
      "List the activities in this teacher's StoryJar library, newest first. Use it to find something to edit, or to check whether an activity already exists before making another one.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional. Only activities whose title contains this." },
        limit: { type: "integer", description: "How many to return. 1 to 100; 25 by default." },
      },
      additionalProperties: false,
    },
    handler: async (teacher, args, origin) => {
      const rows = await listActivities(teacher, { search: args.search as string, limit: args.limit as number });
      return { activities: rows.map((r) => present(r, origin)) };
    },
  },
  {
    name: "get_activity",
    title: "Read an activity",
    description:
      "Read one activity in full, including every question and which page it is on. Call this before update_activity so you are editing what is actually there.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { activity_id: { type: "string", description: "The id from list_activities." } },
      required: ["activity_id"],
      additionalProperties: false,
    },
    handler: async (teacher, args, origin) => {
      const activity = await getActivity(teacher, args.activity_id);
      if (!activity) throw new ActivityInputError("There is no activity with that id in this library.");
      return present(activity, origin);
    },
  },
  {
    name: "create_activity",
    title: "Make a new activity",
    description:
      "Make a new activity in this teacher's library — typically a multiple-choice quiz spread over as many pages as it needs. It goes into the library only. The teacher opens it in StoryJar, checks it, and decides whether to set it for a class, so finish by giving them the url this returns.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        ...activityFields,
        questions: { type: "array", items: questionSchema, description: "The questions, in the order a child should meet them." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (teacher, args, origin) =>
      present(
        await createActivity(teacher, {
          title: args.title,
          instructions: args.instructions,
          tags: args.tags,
          folderId: args.folder_id,
          pages: args.pages,
          pageContent: args.page_content,
          questions: args.questions,
        }),
        origin,
      ),
  },
  {
    name: "update_activity",
    title: "Change an activity",
    description:
      "Change an activity already in the library. Only the fields you send are changed. Sending `questions` REPLACES every question, so read the activity first and send the whole set back, including the ones you are keeping. If get_activity reported `usesAnswerPictures`, the questions cannot be rewritten here — the teacher has to do that in StoryJar — but the title, instructions, tags and folder still can.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "The id from list_activities." },
        ...activityFields,
        questions: { type: "array", items: questionSchema, description: "Replaces every question on the activity." },
        archived: {
          type: "boolean",
          description:
            "Set true to take the activity out of the teacher's library, or false to bring it back. Nothing is deleted and any class already working on it is unaffected — use this to clear up an activity you made by mistake.",
        },
      },
      required: ["activity_id"],
      additionalProperties: false,
    },
    handler: async (teacher, args, origin) => {
      const updated = await updateActivity(teacher, args.activity_id, {
        title: args.title,
        instructions: args.instructions,
        tags: args.tags,
        folderId: args.folder_id,
        pages: args.pages,
        pageContent: args.page_content,
        questions: args.questions,
        archived: args.archived,
      });
      if (!updated) throw new ActivityInputError("There is no activity with that id in this library.");
      return present(updated, origin);
    },
  },
  {
    name: "upload_asset",
    title: "Store a picture, whole or in parts",
    description:
      "Store a picture and get back an id you can put on a question or a page. Send `regions` as well and the picture is CUT UP for you — one id per part — which is how a worksheet becomes one question per page: send the sheet once, name the rectangle each question occupies, and put each part on its own question. For a single picture used in a single place, put it straight on the question instead.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "The picture, as a data:image URL (PNG, JPEG or WebP). Cutting into `regions` needs a PNG." },
        alt: { type: "string", maxLength: 300, description: "What the whole picture shows, for a child who cannot see it." },
        regions: {
          type: "array",
          maxItems: MAX_REGIONS,
          description:
            "Optional. The parts of this picture you want, each cut out and stored on its own. Give one entry per question on the sheet, in reading order. Leave it out to store the picture whole.",
          items: {
            type: "object",
            properties: {
              // Fractions, not pixels, and the descriptions say so twice over.
              // A model is looking at a page it cannot measure: "the left half"
              // is something it knows and "x = 148" is something it would guess.
              x: { type: "number", description: "Left edge of this part, as a fraction of the whole picture's width: 0 is the left edge, 0.5 is halfway across." },
              y: { type: "number", description: "Top edge of this part, as a fraction of the whole picture's height: 0 is the top, 0.5 is halfway down." },
              w: { type: "number", description: "How WIDE this part is, as a fraction of the whole picture's width. Half the page across is 0.5." },
              h: { type: "number", description: "How TALL this part is, as a fraction of the whole picture's height." },
              alt: { type: "string", maxLength: 300, description: "What THIS part shows, for a child who cannot see it — not the whole sheet." },
            },
            required: ["x", "y", "w", "h", "alt"],
            additionalProperties: false,
          },
        },
      },
      required: ["source", "alt"],
      additionalProperties: false,
    },
    handler: async (teacher, args) => {
      const stored = await persistAsset(args);
      // One picture in, one `asset_id` out; parts in, a list out. The shapes are
      // different on purpose — a caller who asked for four regions and got one
      // id back should be able to see that at a glance rather than by counting.
      if (args.regions === undefined) {
        const [only] = stored;
        return { asset_id: only.src, alt: only.alt, ...(only.width ? { width: only.width, height: only.height } : {}) };
      }
      return {
        assets: stored.map((a) => ({ asset_id: a.src, alt: a.alt, width: a.width, height: a.height })),
      };
    },
  },
  {
    name: "list_folders",
    title: "List folders",
    description: "The folders this teacher organises their library with. Use an id here as `folder_id` when making an activity.",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (teacher) => ({ folders: await listFolders(teacher) }),
  },
];

// Does calling this tool change anything?
//
// The transport asks before it consults the billing gate, so that a frozen
// account stays READ-ONLY rather than going blind: RETENTION.md's account-states
// table is explicit that a paused plan can still view and download everything,
// and a teacher locked out of reading their own library would be a worse bug
// than the one the gate exists to prevent. The answer comes from the tool table
// above rather than a second list here, so a new tool cannot be gated wrongly by
// somebody forgetting to add it in two places.
export function toolWrites(name: unknown): boolean {
  const tool = TOOLS.find((t) => t.name === name);
  // An unknown name is treated as a write. It will be refused a moment later as
  // "there is no tool called …", and guessing the safe way round costs nothing.
  return tool ? !tool.readOnly : true;
}

// ---------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

// A tool that refuses is NOT a JSON-RPC error. The spec draws this line
// deliberately: a protocol error is something the client got wrong, while
// "question 3 needs a right answer" is something the MODEL needs to read and
// act on. Returning it as `isError` keeps it in the conversation, which is the
// difference between Claude fixing the quiz and Claude telling the teacher the
// connector is broken.
function toolFailure(id: string | number | null, message: string) {
  return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
}

// Refuse an argument no tool declares, and say what it does declare.
//
// `additionalProperties: false` in the schema is a promise to a client that
// validates; it is not enforcement. A caller who sends `picture` instead of
// `image` used to have it quietly dropped and be told the activity was made —
// which is exactly how a teacher lost a morning to seven pictures that were
// never stored and never refused. Nothing is ignored here any more.
function checkArgs(tool: ToolDef, args: Record<string, unknown>): void {
  const declared = Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>);
  const unknown = Object.keys(args).filter((k) => !declared.includes(k));
  if (!unknown.length) return;
  throw new ActivityInputError(
    `${tool.name} doesn't have ${unknown.length === 1 ? "a field" : "fields"} called ${unknown.map((k) => `\`${k}\``).join(", ")}. ` +
      `It takes ${declared.map((k) => `\`${k}\``).join(", ")}. Nothing was saved. ` +
      `If a field you expected is missing from that list, your copy of the tool list is out of date — remove and re-add the StoryJar connector.`,
  );
}

export type McpOutcome = { status: number; body?: unknown };

// Handle one JSON-RPC message. Returns the response to send, or no body at all
// for a notification (which the transport answers with 202).
export async function handleMcpMessage(message: unknown, teacher: ApiTeacher, origin: string): Promise<McpOutcome> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { status: 400, body: rpcError(null, PARSE_ERROR, "Expected a single JSON-RPC message object.") };
  }
  const req = message as RpcRequest;
  const id = req.id ?? null;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return { status: 400, body: rpcError(id, INVALID_REQUEST, "Not a JSON-RPC 2.0 request.") };
  }

  // Notifications carry no id and get no response body.
  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      return {
        status: 200,
        body: rpcResult(id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }),
      };
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return { status: 202 };

    case "ping":
      return { status: 200, body: rpcResult(id, {}) };

    case "tools/list":
      return {
        status: 200,
        body: rpcResult(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
          })),
        }),
      };

    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return {
          status: 200,
          body: rpcError(
            id,
            INVALID_PARAMS,
            `There is no tool called "${name}". This server has ${TOOLS.map((t) => t.name).join(", ")}. ` +
              `If one of those is missing from your tool list, your copy of it is out of date — remove and re-add the StoryJar connector.`,
          ),
        };
      }
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        checkArgs(tool, args);
        const result = await tool.handler(teacher, args, origin);
        return {
          status: 200,
          body: rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          }),
        };
      } catch (err) {
        // Anything this module raised on purpose is a sentence for the model.
        // Anything else is a fault, and the model is told that a fault happened
        // and nothing more — an internal message could quote a database error
        // carrying another row's contents (rule 8).
        if (err instanceof ActivityInputError) return { status: 200, body: toolFailure(id, err.message) };
        console.error("[mcp] tool failed", tool.name, err instanceof Error ? err.name : typeof err);
        return { status: 200, body: toolFailure(id, "StoryJar couldn't do that just now. Please try again in a moment.") };
      }
    }

    default:
      if (isNotification) return { status: 202 };
      return { status: 200, body: rpcError(id, METHOD_NOT_FOUND, `This server doesn't support "${req.method}".`) };
  }
}
