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
const INSTRUCTIONS = `StoryJar holds the activities a primary-school teacher sets for their class.

Through this connector you can read, create and edit the activities in ONE teacher's own library. A common job is turning a worksheet the teacher shows you into a multi-page quiz: read the worksheet, write the questions, and call create_activity.

Two things to tell the teacher, because they are not obvious:

1. Nothing you make here reaches a child on its own. You are building an activity in the teacher's library; they open it in StoryJar, look at it, and choose whether to set it for a class. Always finish by giving them the link this connector returns.
2. Questions are placed on the page for you — ${QUESTIONS_PER_PAGE} to a page, in the order you send them. Set "page" on a question only when it genuinely belongs on a particular page.

You cannot see classes, pupils, pupils' work, or anything in the approval queue through this connector, and there is no setting that changes that. If a teacher asks you for any of it, tell them it is in StoryJar itself.`;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const questionSchema = {
  type: "object",
  properties: {
    prompt: { type: "string", description: "The question, in words a child of the right age can read." },
    options: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4,
      description: "The answers to choose from. Between two and four.",
    },
    correct: {
      type: "integer",
      description: "Which answer is right, as a position in `options` counting from 0.",
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
  title: { type: "string", description: "What the teacher will see on the card, e.g. \"Tuesday's number bonds\"." },
  instructions: { type: "string", description: "What to do. Read aloud to younger children, so keep it to a sentence or two." },
  tags: { type: "array", items: { type: "string" }, description: "Teacher's own labels, e.g. [\"Maths\", \"Year 2\"]." },
  folder_id: { type: "string", description: "Optional folder to file it in. Get ids from list_folders." },
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
        questions: args.questions,
      });
      if (!updated) throw new ActivityInputError("There is no activity with that id in this library.");
      return present(updated, origin);
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
      if (!tool) return { status: 200, body: rpcError(id, INVALID_PARAMS, `There is no tool called "${name}".`) };
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
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
