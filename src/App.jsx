import { useEffect, useMemo, useRef, useState } from "react";
import { addClip, deleteClip, listClips } from "./db";

function formatDate(ms) {
  const d = new Date(ms);
  return d.toLocaleString();
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function App() {
  const [supported, setSupported] = useState(true);
  const [clips, setClips] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [prompt, setPrompt] = useState("Tell me about yourself (60 sec).");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const previewUrl = useMemo(() => (previewBlob ? URL.createObjectURL(previewBlob) : null), [previewBlob]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) setSupported(false);
  }, []);

  async function refresh() {
    const items = await listClips();
    setClips(items);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startRecording() {
    setPreviewBlob(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    streamRef.current = stream;

    // Prefer webm if available
    const options = { mimeType: "video/webm;codecs=vp8,opus" };
    let rec;
    try {
      rec = new MediaRecorder(stream, options);
    } catch {
      rec = new MediaRecorder(stream);
    }

    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      setPreviewBlob(blob);
      // stop camera
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    rec.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  async function saveRecording() {
    if (!previewBlob) return;

    const id = `${todayKey()}-${crypto.randomUUID()}`;
    const clip = {
      id,
      createdAt: Date.now(),
      prompt: prompt.trim(),
      blob: previewBlob, // IndexedDB can store Blob directly
      mime: previewBlob.type || "video/webm",
    };

    await addClip(clip);
    setPreviewBlob(null);
    await refresh();
  }

  async function removeClip(id) {
    await deleteClip(id);
    await refresh();
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ marginBottom: 8 }}>Speak Diary</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Record one short speaking video per day, replay your progress, and build confidence.
      </p>

      {!supported && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          Your browser doesn’t support video recording. Try Chrome or Edge.
        </div>
      )}

      {supported && (
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12, marginBottom: 18 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Today’s prompt</label>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {!isRecording ? (
              <button onClick={startRecording} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}>
                Start recording
              </button>
            ) : (
              <button onClick={stopRecording} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}>
                Stop
              </button>
            )}

            <button
              onClick={saveRecording}
              disabled={!previewBlob}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: previewBlob ? "pointer" : "not-allowed",
                opacity: previewBlob ? 1 : 0.5,
              }}
            >
              Save today’s video
            </button>
          </div>

          {previewBlob && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Preview</div>
              <video src={previewUrl} controls style={{ width: "100%", borderRadius: 12, border: "1px solid #ddd" }} />
            </div>
          )}
        </div>
      )}

      <h2 style={{ marginBottom: 8 }}>History</h2>
      {clips.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No recordings yet. Record your first one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {clips.map((c) => (
            <ClipCard key={c.id} clip={c} onDelete={removeClip} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClipCard({ clip, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const u = URL.createObjectURL(clip.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip.blob]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{formatDate(clip.createdAt)}</div>
          <div style={{ opacity: 0.8 }}>{clip.prompt || "No prompt"}</div>
        </div>
        <button onClick={() => onDelete(clip.id)} style={{ borderRadius: 10, border: "1px solid #333", padding: "8px 12px", cursor: "pointer" }}>
          Delete
        </button>
      </div>
      <video src={url} controls style={{ width: "100%", marginTop: 12, borderRadius: 12, border: "1px solid #ddd" }} />
    </div>
  );
}
