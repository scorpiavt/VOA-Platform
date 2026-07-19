/**
 * Offline tests for VOA chat UI push path (no Skyrim required).
 * Simulates: CEF send -> JSON queue -> COMMAND dispatch -> RH chatReducer.
 */
"use strict";

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, detail || "");
  }
}

// --- Red House commandReducer (from front/src/reducers/command.ts) ---
function commandReduce(action, storeDispatch) {
  if (action.type !== "COMMAND") return;
  const alter0 = action.data.alter[0];
  const data =
    alter0 && alter0.length ? JSON.parse(alter0) : null;
  storeDispatch({ type: action.data.commandType, data });
}

// --- Red House chatReducer (from front/src/features/client/chat/reducer) ---
function chatReduce(state, action) {
  state = state || { list: [], input: null, listLimit: 50, inputShow: false };
  switch (action.type) {
    case "CHAT_SHOW":
      return { ...state, inputShow: true };
    case "CHAT_HIDE":
      return { ...state, inputShow: false };
    case "CHAT_ADD_MESSAGE": {
      const limit = state.listLimit;
      const list = [...state.list];
      const message = action.data && action.data.message;
      if (message == null) throw new Error("missing action.data.message");
      list.push(message);
      while (list.length > limit) list.shift();
      return { ...state, list };
    }
    default:
      return state;
  }
}

// --- Client browser dispatch() payload builder (must match skymp5-client.js) ---
function buildDispatchJs(commandType, dataObj) {
  let payload = "{}";
  if (dataObj != null)
    payload = JSON.stringify(dataObj)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  return (
    "try{if(window.storage&&window.storage.dispatch){window.storage.dispatch({type:'COMMAND',data:{commandType:'" +
    commandType +
    "',alter:['" +
    payload +
    "']}});}}catch(e){}"
  );
}

// Parse the COMMAND action out of generated JS (what CEF would execute)
function extractCommandAction(jsSrc) {
  // window.storage.dispatch({type:'COMMAND',data:{commandType:'CHAT_ADD_MESSAGE',alter:['...']}})
  const m = jsSrc.match(
    /dispatch\(\{type:'COMMAND',data:\{commandType:'([^']+)',alter:\['([\s\S]*?)'\]\}\}\)/
  );
  if (!m) throw new Error("could not parse dispatch js: " + jsSrc.slice(0, 200));
  return {
    type: "COMMAND",
    data: {
      commandType: m[1],
      alter: [m[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")],
    },
  };
}

// --- getMessageText (RH utils) ---
function getMessageText(string) {
  let hexCount = 0;
  for (let i = 0; i < string.length; i++) {
    if (i + 1 !== string.length && string[i] === "#" && string[i + 1] === "{") {
      const hex = string.substring(i + 2, i + 8);
      hexCount++;
      string =
        string.substring(0, i) +
        `<span style="color: #${hex};">` +
        string.substring(i + 9, string.length);
    }
  }
  for (let i = 0; i < hexCount; i++) string += "</span>";
  return string;
}

// ========== TESTS ==========

// 1) CHAT_SHOW path
{
  const js = buildDispatchJs("CHAT_SHOW", {});
  const cmd = extractCommandAction(js);
  let state = { list: [], input: null, listLimit: 50, inputShow: false };
  commandReduce(cmd, (a) => {
    state = chatReduce(state, a);
  });
  ok("CHAT_SHOW opens input", state.inputShow === true);
}

// 2) CHAT_ADD_MESSAGE with VOA colored line
{
  const msg =
    "#{efc94a}[L] You: #{f0ebe3}hello";
  const js = buildDispatchJs("CHAT_ADD_MESSAGE", { message: msg });
  const cmd = extractCommandAction(js);
  let state = { list: [], input: null, listLimit: 50, inputShow: true };
  let saw = null;
  commandReduce(cmd, (a) => {
    saw = a;
    state = chatReduce(state, a);
  });
  ok("ADD action type", saw && saw.type === "CHAT_ADD_MESSAGE");
  ok("ADD has message", saw && saw.data && saw.data.message === msg, saw && saw.data);
  ok("list length 1", state.list.length === 1, state.list);
  ok("list content", state.list[0] === msg);
  const html = getMessageText(state.list[0]);
  ok("getMessageText has spans", html.includes("<span") && html.includes("hello"), html);
  ok("plain text still present", html.includes("[L] You:") && html.includes("hello"));
}

// 3) Special characters in message
{
  const msg = "#{efc94a}[L] You: #{f0ebe3}it's a test \"quoted\" \\ slash";
  const js = buildDispatchJs("CHAT_ADD_MESSAGE", { message: msg });
  let state = { list: [], input: null, listLimit: 50, inputShow: true };
  let err = null;
  try {
    const cmd = extractCommandAction(js);
    commandReduce(cmd, (a) => {
      state = chatReduce(state, a);
    });
  } catch (e) {
    err = e;
  }
  ok("special chars no throw", !err, err && String(err));
  ok("special chars in list", state.list.length === 1 && state.list[0].includes("it's a test"));
}

// 4) SP storage JSON queue reassignment (not in-place mutation)
{
  const storage = {};
  // queue like browserMessage
  function queueRx(text) {
    let arr = [];
    try {
      const rawQ = storage["voaRhChatPendingJson"];
      if (typeof rawQ === "string" && rawQ.length) arr = JSON.parse(rawQ);
    } catch (e) {
      arr = [];
    }
    if (!arr || !arr.length) arr = [];
    arr.push(text);
    storage["voaRhChatPendingJson"] = JSON.stringify(arr);
  }
  // WRONG way (in-place only) would lose data with SP copy semantics
  queueRx("a");
  queueRx("b");
  const pending = JSON.parse(storage["voaRhChatPendingJson"]);
  ok("queue has 2", pending.length === 2 && pending[0] === "a" && pending[1] === "b");

  // drain like voaChat
  storage["voaRhChatPendingJson"] = "[]";
  // UI queue like pushFrontMessage
  function queueUi(msg) {
    let arr = [];
    const raw = storage["voaChatUiPendingJson"];
    if (typeof raw === "string" && raw.length) {
      try {
        arr = JSON.parse(raw);
      } catch (e) {
        arr = [];
      }
    }
    if (!arr || !arr.length) arr = [];
    arr.push(msg);
    storage["voaChatUiPendingJson"] = JSON.stringify(arr);
  }
  queueUi("#{efc94a}[L] You: #{f0ebe3}hi");
  // drain like browser update
  const uiRaw = storage["voaChatUiPendingJson"];
  storage["voaChatUiPendingJson"] = "[]";
  const uiLines = JSON.parse(uiRaw);
  let state = { list: [], input: null, listLimit: 50, inputShow: true };
  for (const m of uiLines) {
    const js = buildDispatchJs("CHAT_ADD_MESSAGE", { message: m });
    const cmd = extractCommandAction(js);
    commandReduce(cmd, (a) => {
      state = chatReduce(state, a);
    });
  }
  ok("end-to-end queue->COMMAND->list", state.list.length === 1 && state.list[0].includes("hi"), state.list);
}

// 5) De-dupe window: same text twice within 1.5s should only push once from pushFrontMessage logic
{
  const lastUiPush = { key: "", at: 0 };
  function wouldPush(ch, text, now) {
    const dedupeKey = ch + "\0" + text;
    if (dedupeKey === lastUiPush.key && now - lastUiPush.at < 1500) return false;
    lastUiPush.key = dedupeKey;
    lastUiPush.at = now;
    return true;
  }
  ok("first push", wouldPush("l", "x", 1000));
  ok("dup blocked", !wouldPush("l", "x", 1200));
  ok("after window", wouldPush("l", "x", 3000));
}

// 6) Client file static checks
{
  const fs = require("fs");
  const path =
    "C:/Users/wehrm/Desktop/ProjectAetherius/voa-platform/client-dist/skymp5-client.js";
  const s = fs.readFileSync(path, "utf8");
  ok("has v5 browser-owned", s.includes("browser-owned drain") && s.includes("processChatText"));
  ok("has UI pending queue", s.includes("voaChatUiPendingJson"));
  ok("browser drains UI queue", s.includes('sp.storage["voaChatUiPendingJson"]'));
  ok("browser drains rx queue", s.includes('voaRhChatPendingJson') && s.includes("processChatText"));
  ok("dispatch CHAT_ADD_MESSAGE", s.includes('dispatch("CHAT_ADD_MESSAGE"'));
  ok("no installCefHelper call", !s.includes("installCefHelper()"));
  ok("world cleaner soft", s.includes("soft mute only"));
  ok("networking in browser", s.includes("networking_br"));
}

// 7) Live UI bundle still has CHAT_ADD_MESSAGE reducer (if reachable)
async function liveUiCheck() {
  try {
    const res = await fetch("http://178.156.158.116:10001/ui/src.84af235b.js", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      ok("live UI fetch", false, "status " + res.status);
      return;
    }
    const t = await res.text();
    ok("live UI has CHAT_ADD_MESSAGE", t.includes("CHAT_ADD_MESSAGE"));
    ok("live UI has chatReducer list push", /CHAT_ADD_MESSAGE[\s\S]{0,200}push/.test(t));
  } catch (e) {
    ok("live UI fetch", false, String(e.message || e));
  }
}

liveUiCheck().then(() => {
  console.log("\n=== RESULT: " + passed + " passed, " + failed + " failed ===");
  process.exit(failed ? 1 : 0);
});
