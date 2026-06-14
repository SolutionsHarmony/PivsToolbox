// ClaudeTime/art-store.js — per-object progression art persisted as Blobs in IndexedDB.
//
// Three objects keyed by objectId: 'clock' | 'person' | 'car'. Record shapes
// (keyPath 'id'):
//   series:  { id, mode:'series', frames:[Blob, ...] }
//   video:   { id, mode:'video',  blob:Blob }
//   default: NO record (absence => default mode).
//
// On every write we mirror the per-object mode into chrome.storage.local under
// 'artModes' so the renderer can react via storage.onChanged without opening IDB.
//
// Browser-only at runtime (indexedDB / chrome.storage), but requires cleanly
// under Node: nothing touches indexedDB or chrome at module-load time, and every
// method resolves to a safe value (never throws/rejects).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArtStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DB_NAME = 'claudeTimeArt';
  var DB_VERSION = 1;
  var STORE = 'art';
  var OBJECT_IDS = ['clock', 'person', 'car'];

  var dbConn = null; // cached open connection

  // Promisify an IDBRequest.
  function reqPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // Open (and cache) the database. Resolves to the db, or null if unavailable.
  function open() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (dbConn) return Promise.resolve(dbConn);
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = function () { dbConn = req.result; resolve(dbConn); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Run fn(store) inside a transaction of the given mode; resolve to fn's value
  // once the transaction completes. Resolves to null on any failure.
  function withStore(mode, fn) {
    return open().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, mode);
          var store = tx.objectStore(STORE);
          var result;
          Promise.resolve(fn(store)).then(function (r) { result = r; }, function () {});
          tx.oncomplete = function () { resolve(result === undefined ? null : result); };
          tx.onerror = function () { resolve(null); };
          tx.onabort = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    }).catch(function () { return null; });
  }

  // --- artModes mirror (chrome.storage.local) ---------------------------------

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function storageGet(key) {
    return new Promise(function (resolve) {
      try {
        if (!hasChromeStorage()) return resolve({});
        chrome.storage.local.get(key, function (items) {
          resolve(items || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      try {
        if (!hasChromeStorage()) return resolve();
        chrome.storage.local.set(obj, function () { resolve(); });
      } catch (e) {
        resolve();
      }
    });
  }

  // Read-modify-write a single object's mode (or all objects if objectId omitted).
  function setMode(objectId, mode) {
    return storageGet('artModes').then(function (items) {
      var modes = (items && items.artModes) || {};
      if (objectId == null) {
        for (var i = 0; i < OBJECT_IDS.length; i++) modes[OBJECT_IDS[i]] = mode;
      } else {
        modes[objectId] = mode;
      }
      return storageSet({ artModes: modes });
    }).catch(function () {});
  }

  // --- public API -------------------------------------------------------------

  function getArt(objectId) {
    return withStore('readonly', function (store) {
      return reqPromise(store.get(objectId));
    }).then(function (rec) {
      return rec || null;
    }).catch(function () { return null; });
  }

  function putSeries(objectId, framesBlobArray) {
    return withStore('readwrite', function (store) {
      return reqPromise(store.put({ id: objectId, mode: 'series', frames: framesBlobArray }));
    }).then(function () {
      return setMode(objectId, 'series');
    }).catch(function () {});
  }

  function putVideo(objectId, blob) {
    return withStore('readwrite', function (store) {
      return reqPromise(store.put({ id: objectId, mode: 'video', blob: blob }));
    }).then(function () {
      return setMode(objectId, 'video');
    }).catch(function () {});
  }

  function clear(objectId) {
    return withStore('readwrite', function (store) {
      return reqPromise(store.delete(objectId));
    }).then(function () {
      return setMode(objectId, 'default');
    }).catch(function () {});
  }

  function clearAll() {
    return withStore('readwrite', function (store) {
      return reqPromise(store.clear());
    }).then(function () {
      return setMode(null, 'default'); // all three -> default
    }).catch(function () {});
  }

  return {
    open: open,
    getArt: getArt,
    putSeries: putSeries,
    putVideo: putVideo,
    clear: clear,
    clearAll: clearAll
  };
});
