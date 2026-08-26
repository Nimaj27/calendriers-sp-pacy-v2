// ============================================================
// firebase.js — Configuration et initialisation Firebase
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCj7etN5gV8CckkOBiFaKn38D_onZCIE2A",
  authDomain:        "calendrier-pacy.firebaseapp.com",
  projectId:         "calendrier-pacy",
  storageBucket:     "calendrier-pacy.firebasestorage.app",
  messagingSenderId: "767402684897",
  appId:             "1:767402684897:web:134c456b1de29b2dace2a0"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, increment,
  enableNetwork, disableNetwork, writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({ forceOwnership: false })
    })
  });
} catch (e) {
  console.warn("Persistence hors-ligne indisponible:", e?.message);
  db = getFirestore(app);
}

const COLLECTIONS = {
  CONFIG:   "config",
  EQUIPES:  "equipes",
  SECTEURS: "secteurs",
  PASSAGES: "passages",
  ADMINS:   "admins",
  PINS:     "pins",     // { pin } → { equipeId } : le code est l'identifiant du document
  JOURNAL:  "journal"   // traçabilité des corrections et suppressions
};

const fsCollection = (name)          => collection(db, name);
const fsDoc        = (path, ...id)   => doc(db, path, ...id);
const fsAdd        = (col, data)     => addDoc(collection(db, col), { ...data, createdAt: serverTimestamp() });
const fsSet        = (col, id, data) => setDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
const fsUpdate     = (col, id, data) => updateDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() });
const fsDelete     = (col, id)       => deleteDoc(doc(db, col, id));
const fsGet        = async (col, id) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
const fsGetAll     = async (col)     => { const s = await getDocs(collection(db, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); };
const fsQuery      = async (col, ...constraints) => {
  const s = await getDocs(query(collection(db, col), ...constraints));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
const fsListen     = (col, cb, ...constraints) => {
  const q = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
};
const fsListenDoc  = (col, id, cb) =>
  onSnapshot(doc(db, col, id), snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));

// ── Session technique ────────────────────────────────────────
// Les règles Firestore exigent une session. Les équipiers (code PIN) n'ont
// pas de compte : on leur ouvre une session anonyme Firebase, ce qui permet
// aux règles de refuser tout accès direct à l'API hors de l'application.
let _sessionEnCours = null;
async function assurerSession() {
  if (auth.currentUser) return auth.currentUser;
  if (_sessionEnCours) return _sessionEnCours;
  _sessionEnCours = signInAnonymously(auth)
    .then(r => { _sessionEnCours = null; return r.user; })
    .catch(e => {
      _sessionEnCours = null;
      console.error("Session anonyme refusée :", e?.code || e);
      throw e;
    });
  return _sessionEnCours;
}

const estAnonyme = () => !!auth.currentUser?.isAnonymous;

const loginGoogle      = () => signInWithPopup(auth, googleProvider);
const getLoginRedirect = () => Promise.resolve(null);
const logoutGoogle     = () => signOut(auth);
const onAuth           = (cb) => onAuthStateChanged(auth, cb);

async function isAdmin(email) {
  if (!email) return false;
  const snap = await getDoc(doc(db, COLLECTIONS.ADMINS, String(email).trim().toLowerCase()));
  return snap.exists();
}

// Connexion par code PIN.
// Le PIN sert d'identifiant de document dans /pins : il faut donc connaître
// le code exact pour obtenir la moindre information. La collection n'est pas
// énumérable (règle "list" réservée aux administrateurs).
async function loginPin(pin) {
  const ref = await fsGet(COLLECTIONS.PINS, String(pin));
  if (!ref || !ref.equipeId) {
    // Repli sur l'ancien stockage, le temps que la migration soit faite
    const legacy = await fsQuery(COLLECTIONS.EQUIPES, where("pin", "==", pin));
    return legacy.length ? legacy[0] : null;
  }
  const equipe = await fsGet(COLLECTIONS.EQUIPES, ref.equipeId);
  return equipe || null;
}

const _networkListeners = [];
let _isOnline = navigator.onLine;
window.addEventListener("online",  () => { _isOnline = true;  _networkListeners.forEach(cb => cb(true)); });
window.addEventListener("offline", () => { _isOnline = false; _networkListeners.forEach(cb => cb(false)); });
function isOnline() { return _isOnline; }
function onNetworkChange(cb) {
  _networkListeners.push(cb);
  return () => { const idx = _networkListeners.indexOf(cb); if (idx > -1) _networkListeners.splice(idx, 1); };
}

export {
  db, auth, writeBatch,
  COLLECTIONS,
  fsCollection, fsDoc, fsAdd, fsSet, fsUpdate, fsDelete,
  fsGet, fsGetAll, fsQuery, fsListen, fsListenDoc,
  loginGoogle, getLoginRedirect, logoutGoogle, onAuth, isAdmin, loginPin,
  assurerSession, estAnonyme,
  where, orderBy, serverTimestamp, increment,
  isOnline, onNetworkChange, enableNetwork, disableNetwork
};
