import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, doc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = id => document.getElementById(id);
const cfg = window.FIREBASE_CONFIG;
const KINDS = ["clients", "visits"];
const known = { clients: {}, visits: {} };
let unsubs = [];

function setStatus(text, btn) {
  $("cloudStatus").textContent = text;
  $("cloudBtn").textContent = btn;
}

if (!cfg || !cfg.apiKey || cfg.apiKey.startsWith("PASTE")) {
  setStatus("Local only (Firebase is not set up yet)", "");
  $("cloudBtn").hidden = true;
} else {
  const app = initializeApp(cfg);
  const db = getFirestore(app);
  const auth = getAuth(app);
  const norm = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
  const clean = o => { const { id, ...data } = o; return JSON.parse(JSON.stringify(data)); };
  const fail = e => setStatus("Cloud error: " + (e.code || e.message), "Sign out");

  // Send only what changed to Firestore (called by app.js after every save).
  function push(state) {
    if (!auth.currentUser) return;
    KINDS.forEach(kind => {
      const cur = {};
      (state[kind] || []).forEach(o => {
        const s = norm(o);
        cur[o.id] = true;
        if (known[kind][o.id] !== s) {
          known[kind][o.id] = s;
          setDoc(doc(db, kind, o.id), clean(o)).catch(fail);
        }
      });
      Object.keys(known[kind]).forEach(id => {
        if (!cur[id]) { delete known[kind][id]; deleteDoc(doc(db, kind, id)).catch(fail); }
      });
    });
  }
  window.gymApp.onSave = push;

  onAuthStateChanged(auth, async user => {
    unsubs.forEach(u => u());
    unsubs = [];
    KINDS.forEach(k => { known[k] = {}; });
    if (!user) {
      setStatus("Not signed in. Data is saved on this computer only.", "Sign in");
      if (!$("loginDlg").open) $("loginDlg").showModal();
      return;
    }
    if ($("loginDlg").open) $("loginDlg").close();
    setStatus("Cloud sync on: " + user.email, "Sign out");
    try {
      // First time: if the cloud is empty, upload the clients already saved on this computer.
      const probe = await getDocs(collection(db, "clients"));
      const local = window.gymApp.get();
      if (probe.empty && local.clients.length) push(local);
    } catch (e) { fail(e); return; }
    KINDS.forEach(kind => unsubs.push(onSnapshot(collection(db, kind), snap => {
      const list = [];
      known[kind] = {};
      snap.forEach(d => { const o = d.data(); o.id = d.id; list.push(o); known[kind][d.id] = norm(o); });
      window.gymApp.apply(kind, list);
    }, fail)));
  });

  $("cloudBtn").onclick = async () => {
    if (auth.currentUser) {
      await signOut(auth);
      window.gymApp.apply("clients", []);
      window.gymApp.apply("visits", []);
    } else $("loginDlg").showModal();
  };
  $("loginBtn").onclick = async () => {
    $("loginMsg").textContent = "";
    try { await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPass").value); }
    catch (e) { $("loginMsg").textContent = "Sign in failed: " + (e.code || "error"); }
  };
  $("loginPass").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
  $("loginClose").onclick = () => $("loginDlg").close();
}
