const DB_NAME = "preventa_offline_db";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("outbox_pedidos")) {
        db.createObjectStore("outbox_pedidos", { keyPath: "local_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function guardarCacheLocal(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerCacheLocal(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readonly");
    const req = tx.objectStore("cache").get(key);
    req.onsuccess = () => resolve(req.result?.value || null);
    req.onerror = () => reject(req.error);
  });
}

export async function encolarPedidoOffline(pedidoItem) {
  const db = await openDB();
  const registro = {
    ...pedidoItem,
    local_id: `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    created_at: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_pedidos", "readwrite");
    tx.objectStore("outbox_pedidos").put(registro);
    tx.oncomplete = () => resolve(registro);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listarPedidosOffline() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_pedidos", "readonly");
    const req = tx.objectStore("outbox_pedidos").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function eliminarPedidoOffline(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox_pedidos", "readwrite");
    tx.objectStore("outbox_pedidos").delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
