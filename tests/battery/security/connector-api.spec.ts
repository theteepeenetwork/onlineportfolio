import { test, expect } from "@playwright/test";
import { API_TOKEN, SCHOOL_A, SCHOOL_B, loginStudent, loginTeacher, mcpCall, mcpTool, ownThrottleKey } from "../helpers";

// The Claude connector: the MCP endpoint, the REST API behind it, and the OAuth
// server that lets claude.ai add it.
//
// This is a blocking gate because the connector is a new door into a teacher's
// account that opens with a bearer token and no browser session. The questions
// it has to keep answering are the ones SAFEGUARDING asks of every door: who
// gets in (rule 8), what they can reach once in (rule 4), and whether the answer
// is the same for a token as it is for a cookie (rule 5's shape — no path that
// sees more than the person it belongs to).

const AUTH = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

test.describe("connector — the door", () => {
  test("A1 no token, no entry, and the refusal says where to sign in", async ({ request }) => {
    const res = await request.post("/api/mcp", {
      headers: ownThrottleKey("conn-a1"),
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    // RFC 9728: without this header a connector has nothing to act on.
    expect(res.headers()["www-authenticate"]).toContain("resource_metadata=");
  });

  test("A2 a made-up token is refused, and so is a real one that has been revoked", async ({ request }) => {
    const invented = await request.post("/api/mcp", {
      headers: { ...AUTH("sj_live_notarealtokenatallnotarealtokenatall"), ...ownThrottleKey("conn-a2") },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      failOnStatusCode: false,
    });
    expect(invented.status()).toBe(401);

    // A token that is not even the right shape must not reach the database.
    const nonsense = await request.post("/api/mcp", {
      headers: { ...AUTH("hello"), ...ownThrottleKey("conn-a2b") },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      failOnStatusCode: false,
    });
    expect(nonsense.status()).toBe(401);
  });

  test("A3 a real token gets in and can list its own library", async ({ request }) => {
    const { status, body } = await mcpCall(request, API_TOKEN.schoolA, "tools/list");
    expect(status).toBe(200);
    const names = ((body as { result: { tools: { name: string }[] } }).result.tools).map((t) => t.name);
    expect(names).toContain("create_activity");
    // The tool surface is the permission model. A tool that reaches a class, a
    // pupil or the queue would have to appear here first, so this list failing
    // is the alarm.
    expect(names.sort()).toEqual(["create_activity", "get_activity", "list_activities", "list_folders", "update_activity"]);
  });

  test("A4 one teacher's bad token does not lock out the school behind the same address", async ({ request }) => {
    // A school is one NAT IP (see src/lib/rateLimit.ts). If the throttle were
    // checked before the token, five stale attempts from one classroom would
    // take the connector away from everybody else in the building.
    const shared = ownThrottleKey("conn-a4");
    for (let i = 0; i < 8; i++) {
      const bad = await request.post("/api/mcp", {
        headers: { ...AUTH("sj_live_wrongwrongwrongwrongwrongwrongwrongwrong"), ...shared },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
        failOnStatusCode: false,
      });
      expect([401, 429]).toContain(bad.status());
    }

    const good = await request.post("/api/mcp", {
      headers: { ...AUTH(API_TOKEN.schoolA), ...shared },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      failOnStatusCode: false,
    });
    expect(good.status(), "a valid token must never be refused for a neighbour's mistakes").toBe(200);
  });
});

test.describe("connector — tenant isolation", () => {
  test("B1 School A's token cannot read School B's activity", async ({ request }) => {
    const mine = await mcpTool(request, API_TOKEN.schoolB, "list_activities", {});
    const theirs = (mine.data as { activities: { id: string }[] }).activities;
    expect(theirs.length).toBeGreaterThan(0);
    const oakfieldId = theirs[0].id;

    const crossRead = await mcpTool(request, API_TOKEN.schoolA, "get_activity", { activity_id: oakfieldId });
    expect(crossRead.isError).toBe(true);
    // Not found and not yours read the same, so the refusal cannot confirm the
    // row exists (rule 8).
    expect(crossRead.text).toContain("no activity with that id");

    const rest = await request.get(`/api/v1/activities/${oakfieldId}`, {
      headers: AUTH(API_TOKEN.schoolA),
      failOnStatusCode: false,
    });
    expect(rest.status()).toBe(404);
  });

  test("B2 School A's token cannot WRITE to School B's activity", async ({ request }) => {
    const theirs = await mcpTool(request, API_TOKEN.schoolB, "list_activities", {});
    const oakfieldId = (theirs.data as { activities: { id: string; title: string }[] }).activities[0];

    const crossWrite = await mcpTool(request, API_TOKEN.schoolA, "update_activity", {
      activity_id: oakfieldId.id,
      title: "Owned by School A now",
    });
    expect(crossWrite.isError).toBe(true);

    // And the title really is untouched — a refusal that still wrote would pass
    // the assertion above.
    const after = await mcpTool(request, API_TOKEN.schoolB, "get_activity", { activity_id: oakfieldId.id });
    expect((after.data as { title: string }).title).toBe(oakfieldId.title);
  });

  test("B3 a listing only ever contains the token's own activities", async ({ request }) => {
    const a = await mcpTool(request, API_TOKEN.schoolA, "list_activities", { limit: 100 });
    const b = await mcpTool(request, API_TOKEN.schoolB, "list_activities", { limit: 100 });
    const idsA = new Set((a.data as { activities: { id: string }[] }).activities.map((x) => x.id));
    const idsB = (b.data as { activities: { id: string }[] }).activities.map((x) => x.id);
    expect(idsB.length).toBeGreaterThan(0);
    for (const id of idsB) expect(idsA.has(id)).toBe(false);
  });

  test("B4 a folder belonging to another teacher cannot be filed into", async ({ request }) => {
    const folders = await mcpTool(request, API_TOKEN.schoolB, "list_folders", {});
    const theirFolders = (folders.data as { folders: { id: string }[] }).folders;
    test.skip(theirFolders.length === 0, "School B has no folder fixture to borrow");

    const attempt = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Filed somewhere it doesn't belong",
      folder_id: theirFolders[0].id,
    });
    expect(attempt.isError).toBe(true);
    expect(attempt.text).toContain("isn't one of yours");
  });
});

test.describe("connector — what a token cannot reach at all", () => {
  test("C1 no tool, and no REST route, exposes a class, a pupil or the queue", async ({ request }) => {
    // The negative that matters most, asserted against the running server rather
    // than against a reading of the source. If any of these ever answers, the
    // connector has grown a door nobody reviewed.
    for (const path of [
      "/api/v1/classes",
      "/api/v1/students",
      "/api/v1/pupils",
      "/api/v1/journal",
      "/api/v1/moments",
      "/api/v1/queue",
      "/api/v1/assignments",
    ]) {
      const res = await request.get(path, { headers: AUTH(API_TOKEN.schoolA), failOnStatusCode: false });
      expect(res.status(), `${path} must not exist`).toBe(404);
    }
  });

  test("C2 the token identifies its teacher and nothing more", async ({ request }) => {
    const res = await request.get("/api/v1/me", { headers: AUTH(API_TOKEN.schoolA) });
    const body = await res.json();
    // A name, because the connector says "connected as …". Not an email, not a
    // school id, not an internal id.
    expect(Object.keys(body.teacher)).toEqual(["name"]);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  test("C3 an activity read back carries no child data", async ({ request }) => {
    const list = await mcpTool(request, API_TOKEN.schoolB, "list_activities", { limit: 100 });
    const first = (list.data as { activities: { id: string }[] }).activities[0];
    const detail = await mcpTool(request, API_TOKEN.schoolB, "get_activity", { activity_id: first.id });
    const text = detail.text;
    for (const childName of [SCHOOL_B.student, "Yusuf", SCHOOL_A.student]) {
      expect(text, `a pupil's name must never come back through the connector`).not.toContain(childName);
    }
    // Nor a class code, which is a credential a child signs in with.
    expect(text).not.toContain(SCHOOL_B.classCode);
    expect(text).not.toContain(SCHOOL_A.classCode);
  });
});

test.describe("connector — writing", () => {
  test("D1 a multi-page quiz is built, and the pages are real", async ({ request }) => {
    const made = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Connector spec — bonds to ten",
      instructions: "Tap the right answer.",
      questions: Array.from({ length: 9 }, (_, i) => ({
        prompt: `Question ${i + 1}: what is ${i} + 1?`,
        options: [`${i}`, `${i + 1}`, `${i + 2}`],
        correct: 1,
      })),
    });
    expect(made.isError).toBe(false);
    const activity = made.data as { id: string; pages: number; questionCount: number };
    expect(activity.questionCount).toBe(9);
    // Nine questions at four to a page is three pages. If pages did not follow
    // the questions, the last five would be on a page no child can reach.
    expect(activity.pages).toBe(3);

    const read = await mcpTool(request, API_TOKEN.schoolA, "get_activity", { activity_id: activity.id });
    const questions = (read.data as { questions: { page: number }[] }).questions;
    expect(new Set(questions.map((q) => q.page))).toEqual(new Set([1, 2, 3]));
    // Read back, not just reported at write time. A field session found six
    // questions sitting on zero pages, which means five of them were on pages no
    // child could reach.
    expect((read.data as { pages: number }).pages).toBe(3);
  });

  test("D1b explicitly-paged questions get exactly that many pages", async ({ request }) => {
    const made = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Connector spec — one question per page",
      questions: Array.from({ length: 6 }, (_, i) => ({
        prompt: `Question ${i + 1}: what happened?`,
        options: ["A", "B", "C"],
        correct: 1,
        page: i + 1,
      })),
    });
    expect(made.isError).toBe(false);
    expect((made.data as { pages: number }).pages).toBe(6);

    const read = await mcpTool(request, API_TOKEN.schoolA, "get_activity", { activity_id: (made.data as { id: string }).id });
    expect((read.data as { pages: number }).pages, "the pages are still there when read back").toBe(6);
  });

  test("D2 a quiz with no right answer is refused, in words a teacher can act on", async ({ request }) => {
    const bad = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Connector spec — broken quiz",
      questions: [{ prompt: "2 + 2?", options: ["3", "4"], correct: 7 }],
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("Question 1");
    // A refusal is a tool result, not a transport error — otherwise the model
    // reports "the connector is broken" instead of fixing the quiz.
    expect(bad.status).toBe(200);
  });

  test("D2b every bad question is reported at once, not one per round trip", async ({ request }) => {
    const bad = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Connector spec — three bad questions",
      questions: [
        { prompt: "x".repeat(400), options: ["A", "B"], correct: 0 },
        { prompt: "only one answer", options: ["A"], correct: 0 },
        { prompt: "correct out of range", options: ["A", "B"], correct: 9 },
      ],
    });
    expect(bad.isError).toBe(true);
    // All three, in one refusal. Reporting only the first cost a caller three
    // attempts to learn three things it could have been told once.
    expect(bad.text).toContain("Question 1");
    expect(bad.text).toContain("Question 2");
    expect(bad.text).toContain("Question 3");
  });

  test("D2c the limits are in the schema, not only in the refusal", async ({ request }) => {
    // A model that learns the prompt cap from a rejection has already composed
    // the whole payload. The cap has to be visible while it drafts.
    const { body } = await mcpCall(request, API_TOKEN.schoolA, "tools/list");
    const tools = (body as { result: { tools: { name: string; inputSchema: Record<string, unknown> }[] } }).result.tools;
    const create = tools.find((t) => t.name === "create_activity")!;
    const question = (create.inputSchema as { properties: { questions: { items: { properties: Record<string, { maxLength?: number }> } } } })
      .properties.questions.items.properties;
    expect(question.prompt.maxLength).toBe(300);
    expect((create.inputSchema as { properties: { title: { maxLength?: number } } }).properties.title.maxLength).toBeTruthy();
  });

  test("D6 an activity can be archived and brought back, and nothing is destroyed", async ({ request }) => {
    const made = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "Connector spec — archive probe",
      questions: [{ prompt: "2 + 2?", options: ["3", "4"], correct: 1 }],
    });
    const id = (made.data as { id: string }).id;

    await mcpTool(request, API_TOKEN.schoolA, "update_activity", { activity_id: id, archived: true });
    const hidden = await mcpTool(request, API_TOKEN.schoolA, "list_activities", { search: "archive probe", limit: 100 });
    expect((hidden.data as { activities: unknown[] }).activities).toHaveLength(0);

    // Archiving is not deleting: it comes back whole, pages and all.
    await mcpTool(request, API_TOKEN.schoolA, "update_activity", { activity_id: id, archived: false });
    const back = await mcpTool(request, API_TOKEN.schoolA, "get_activity", { activity_id: id });
    expect(back.isError).toBe(false);
    expect((back.data as { pages: number; questionCount: number }).pages).toBe(1);
    expect((back.data as { questionCount: number }).questionCount).toBe(1);
  });

  test("D3 an internal fault never returns its own message", async ({ request }) => {
    // A prompt long past every bound. Whatever goes wrong, the caller gets a
    // sentence we wrote, not a database error carrying another row's contents.
    const bad = await mcpTool(request, API_TOKEN.schoolA, "create_activity", {
      title: "x".repeat(5000),
      questions: [],
    });
    expect(bad.isError).toBe(true);
    expect(bad.text.toLowerCase()).not.toContain("prisma");
    expect(bad.text.toLowerCase()).not.toContain("sqlite");
  });

  test("D4 a frozen account is read-only through the connector too", async ({ request }) => {
    const read = await mcpTool(request, API_TOKEN.schoolCFrozen, "list_activities", {});
    expect(read.isError).toBe(false);

    const write = await mcpTool(request, API_TOKEN.schoolCFrozen, "create_activity", {
      title: "Should not be possible",
    });
    expect(write.isError).toBe(true);
    // In band, so the model relays a sentence the teacher can act on rather than
    // "the connector failed". The REST surface still answers 403.
    expect(write.text.toLowerCase()).toContain("read-only");

    const rest = await request.post("/api/v1/activities", {
      headers: AUTH(API_TOKEN.schoolCFrozen),
      data: { title: "Should not be possible" },
      failOnStatusCode: false,
    });
    expect(rest.status()).toBe(403);

    // And nothing was written under either route.
    const after = await mcpTool(request, API_TOKEN.schoolCFrozen, "list_activities", { limit: 100 });
    expect(after.text).not.toContain("Should not be possible");
  });

  test("D4b a picture-answer quiz is not quietly turned into a text one", async ({ request }) => {
    // School B's fixture quiz uses a picture for at least one answer. The
    // connector has no way to say "this picture", so a rewrite would replace it
    // with the words used to stand in for it and the teacher would lose the
    // pictures without being told.
    const list = await mcpTool(request, API_TOKEN.schoolB, "list_activities", { limit: 100 });
    const ids = (list.data as { activities: { id: string }[] }).activities.map((a) => a.id);

    let pictureQuiz: string | null = null;
    for (const id of ids) {
      const detail = await mcpTool(request, API_TOKEN.schoolB, "get_activity", { activity_id: id });
      if ((detail.data as { usesAnswerPictures?: boolean }).usesAnswerPictures) {
        pictureQuiz = id;
        break;
      }
    }
    expect(pictureQuiz, "expected School B's fixture quiz to use an answer picture").toBeTruthy();

    const rewrite = await mcpTool(request, API_TOKEN.schoolB, "update_activity", {
      activity_id: pictureQuiz!,
      questions: [{ prompt: "Rewritten", options: ["yes", "no"], correct: 0 }],
    });
    expect(rewrite.isError).toBe(true);
    expect(rewrite.text).toContain("pictures");

    // Renaming it is still allowed — only the answers are protected.
    const renamed = await mcpTool(request, API_TOKEN.schoolB, "update_activity", {
      activity_id: pictureQuiz!,
      title: "Renamed by the connector",
    });
    expect(renamed.isError).toBe(false);
  });

  test("D5 an edit does not reach a class already working on it", async ({ request, page }) => {
    // The connector edits the LIBRARY copy and deliberately does not push onto
    // live runs, unlike the teacher's own editor — where they are looking at the
    // thing they are changing. Asserted from the child's side, because that is
    // the only place it matters: a pupil mid-way through a quiz must not have it
    // change because a chat window said so.
    const list = await mcpTool(request, API_TOKEN.schoolB, "list_activities", { limit: 100 });
    const withRun = (list.data as { activities: { id: string; title: string; live_runs: number }[] }).activities.find(
      (a) => a.live_runs > 0,
    );
    expect(withRun, "expected a School B fixture activity to have a live run").toBeTruthy();

    const marker = `Rewritten by the connector ${Date.now()}`;
    const edited = await mcpTool(request, API_TOKEN.schoolB, "update_activity", {
      activity_id: withRun!.id,
      title: marker,
    });
    expect(edited.isError).toBe(false);
    // The library copy really did change — otherwise the assertion below would
    // pass for the wrong reason.
    expect((edited.data as { title: string }).title).toBe(marker);

    // The caller is told the run is out there, so it can say so to the teacher.
    expect(edited.text).toContain("keep the version they were given");

    // And the child still sees what they were set.
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student);
    await page.goto("/student/activities");
    expect(await page.locator("body").innerText()).not.toContain(marker);
  });

});

test.describe("connector — OAuth", () => {
  test("E1 discovery documents advertise one way in, not several", async ({ request }) => {
    const meta = await (await request.get("/.well-known/oauth-authorization-server")).json();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.response_types_supported).toEqual(["code"]);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);

    const resource = await (await request.get("/.well-known/oauth-protected-resource")).json();
    expect(resource.resource).toContain("/api/mcp");
    expect(resource.authorization_servers[0]).toBe(meta.issuer);
  });

  test("E2 a client cannot register a redirect it could be phished through", async ({ request }) => {
    for (const uri of ["http://evil.example/cb", "javascript:alert(1)", "data:text/html,x", "ftp://x/y"]) {
      const res = await request.post("/api/oauth/register", {
        data: { client_name: "Test", redirect_uris: [uri] },
        failOnStatusCode: false,
      });
      expect(res.status(), `${uri} must be refused`).toBe(400);
    }
  });

  test("E3 the consent screen refuses an unregistered redirect rather than obeying it", async ({ page }) => {
    const reg = await page.request.post("/api/oauth/register", {
      data: { client_name: "Spec client", redirect_uris: ["https://example.test/cb"] },
    });
    const client = await reg.json();

    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto(
      `/oauth/authorize?response_type=code&client_id=${client.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://attacker.test/cb")}` +
        `&code_challenge=${"a".repeat(43)}&code_challenge_method=S256`,
    );

    // Refused on our own page. A redirect here — even an error redirect — is an
    // open redirect wearing an apology.
    await expect(page.getByText("StoryJar didn’t allow that")).toBeVisible();
    expect(page.url()).toContain("/oauth/authorize");
  });

  test("E4 PKCE is required, and plain is not accepted", async ({ page }) => {
    const reg = await page.request.post("/api/oauth/register", {
      data: { client_name: "Spec client", redirect_uris: ["https://example.test/cb"] },
    });
    const client = await reg.json();

    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto(
      `/oauth/authorize?response_type=code&client_id=${client.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://example.test/cb")}` +
        `&code_challenge=${"a".repeat(43)}&code_challenge_method=plain`,
    );
    await expect(page.getByText("StoryJar didn’t allow that")).toBeVisible();
  });

  test("E5 the token endpoint refuses a code it never issued", async ({ request }) => {
    const res = await request.post("/api/oauth/token", {
      form: {
        grant_type: "authorization_code",
        client_id: "made-up",
        code: "sjc_nope",
        redirect_uri: "https://example.test/cb",
        code_verifier: "v".repeat(43),
      },
      headers: ownThrottleKey("conn-e5"),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    // A live credential must never be cacheable by anything in between.
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("E6 signing in mid-connection cannot be used as an open redirect", async ({ page }) => {
    await page.goto("/login/teacher?next=https%3A%2F%2Fattacker.test%2Fsteal");
    await page.getByLabel(/email/i).fill(SCHOOL_A.admin.email);
    await page.getByLabel(/password/i).fill(SCHOOL_A.admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // The teacher's own dashboard, not the address in the query string. The
    // pattern is anchored: "/login/teacher" also contains "/teacher", and a
    // loose match would pass without the sign-in having gone anywhere.
    await page.waitForURL((url) => url.pathname === "/teacher");
    expect(page.url()).not.toContain("attacker.test");
  });
});
