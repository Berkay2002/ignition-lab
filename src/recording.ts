import type { DrivingSnapshot } from "./drive-ui.js";
import type { CycleModel } from "./engine.js";
import { Renderer } from "./renderer.js";

type Clip = { url: string; name: string; title: string; seconds: number };
type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  timer: number;
  chunks: Blob[];
  snapshot: DrivingSnapshot;
};

function control(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement))
    throw new Error(`Missing recording button: ${id}`);
  return el;
}

/** Records the rendered simulation and its Web Audio output, entirely locally. */
export class RecordingStudio {
  private session: Session | null = null;
  private opening = false;
  private attempt = 0;
  private clips: Clip[] = [];
  private readonly canvas = document.createElement("canvas");
  private readonly pv = document.createElement("canvas");
  private readonly button = control("record-drive");
  private readonly status = document.getElementById("record-status");
  private readonly dialog = document.createElement("dialog");
  private readonly gallery = document.createElement("div");

  constructor(
    private readonly hooks: {
      audioStream: () => Promise<MediaStream>;
      startRun: () => void;
      snapshot: () => DrivingSnapshot;
    },
  ) {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.dialog.className = "record-dialog";
    this.dialog.setAttribute("aria-label", "Recorded runs and comparison");
    this.dialog.innerHTML =
      '<div class="record-heading"><h2>Recorded runs</h2><button aria-label="Close recordings">×</button></div><p class="drive-small">The last two clips stay in this tab. Download them to keep them. Recordings stop after 60 seconds.</p>';
    this.gallery.className = "record-clips";
    this.dialog.append(this.gallery);
    document.body.append(this.dialog);
    this.dialog
      .querySelector("button")
      ?.addEventListener("click", () => this.dialog.close());
    this.dialog.addEventListener("close", () =>
      this.gallery.querySelectorAll("video").forEach((v) => v.pause()),
    );
    control("show-recordings").onclick = () => {
      this.showClips();
      this.dialog.showModal();
    };
    this.button.onclick = () => {
      if (this.active) this.stop();
      else void this.start();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
    });
  }

  get active(): boolean {
    return this.session !== null;
  }
  private message(text: string) {
    if (this.status) this.status.textContent = text;
  }

  private async start() {
    if (this.opening || this.active) return;
    this.opening = true;
    const attempt = ++this.attempt;
    this.button.disabled = true;
    let stream: MediaStream | null = null;
    try {
      if (typeof MediaRecorder === "undefined" || !this.canvas.captureStream)
        throw new Error("Video recording is unavailable in this browser.");
      const mime = [
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime)
        throw new Error("No supported video and audio recording format.");
      const audio = await this.hooks.audioStream();
      if (attempt !== this.attempt) return;
      this.hooks.startRun();
      stream = this.canvas.captureStream(30);
      for (const track of audio.getAudioTracks())
        stream.addTrack(track.clone());
      if (!stream.getAudioTracks().length)
        throw new Error("The engine audio stream is unavailable.");
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 5_000_000,
      });
      const startedAt = performance.now();
      const session: Session = {
        recorder,
        stream,
        chunks: [],
        timer: 0,
        snapshot: this.hooks.snapshot(),
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) session.chunks.push(event.data);
      };
      recorder.onstop = () => {
        for (const track of session.stream.getTracks()) track.stop();
        window.clearTimeout(session.timer);
        const blob = new Blob(session.chunks, { type: recorder.mimeType });
        if (blob.size) {
          const ext = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
          const stamp = new Date().toISOString().replaceAll(":", "-");
          this.clips.unshift({
            url: URL.createObjectURL(blob),
            name: `ignition-run-${stamp}.${ext}`,
            title: `${session.snapshot.profile} · ${session.snapshot.scenario}`,
            seconds: (performance.now() - startedAt) / 1000,
          });
          while (this.clips.length > 2) {
            const removed = this.clips.pop();
            if (removed) URL.revokeObjectURL(removed.url);
          }
          this.message(
            "Clip saved in this tab. Open Clips & comparison to download.",
          );
        } else this.message("No video was captured.");
        if (this.session === session) this.session = null;
        this.button.textContent = "Record video + sound";
        this.showClips();
      };
      recorder.onerror = () => {
        this.message("Recording failed in this browser.");
        this.stop();
      };
      this.session = session;
      recorder.start(250);
      session.timer = window.setTimeout(() => this.stop(), 60_000);
      this.button.textContent = "Stop recording";
      this.message("Recording the scenario and synthesized engine audio…");
    } catch (error) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      this.session = null;
      this.message(
        error instanceof Error ? error.message : "Recording could not start.",
      );
    } finally {
      this.opening = false;
      this.button.disabled = false;
    }
  }

  stop() {
    this.attempt++;
    const session = this.session;
    if (session && session.recorder.state !== "inactive")
      session.recorder.stop();
  }

  draw(
    engine: HTMLCanvasElement,
    plot: HTMLCanvasElement,
    snapshot: DrivingSnapshot,
    model: CycleModel,
    phase: number,
  ) {
    if (!this.active) return;
    const c = this.canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = "#f6f8f9";
    c.fillRect(0, 0, 1280, 720);
    if (engine.width && engine.height) {
      const scale = Math.min(1280 / engine.width, 640 / engine.height);
      c.drawImage(
        engine,
        (1280 - engine.width * scale) / 2,
        20,
        engine.width * scale,
        engine.height * scale,
      );
    }
    c.fillStyle = "#ffffffee";
    c.fillRect(30, 27, 510, 91);
    c.fillStyle = "#304b5c";
    c.font = "24px sans-serif";
    c.fillText("Ignition / Lab", 48, 60);
    c.font = "15px sans-serif";
    c.fillText(snapshot.profile, 48, 87);
    c.fillStyle = "#ffffffee";
    c.fillRect(30, 138, 280, 253);
    c.fillStyle = "#587587";
    c.font = "12px sans-serif";
    c.fillText("P-V · generic 4.0 L study reference", 44, 158);
    Renderer.pv(this.pv, model, phase, { width: 260, height: 195 });
    c.drawImage(this.pv, 40, 168, 260, 195);
    c.fillText(`∮ p dV = ${model.work.toFixed(1)} J / cylinder`, 44, 380);
    c.fillStyle = "#ffffffee";
    c.fillRect(890, 27, 365, 248);
    c.fillStyle = "#587587";
    c.font = "14px sans-serif";
    c.fillText(snapshot.scenario, 905, 50);
    if (plot.width && plot.height) c.drawImage(plot, 900, 62, 345, 198);
    c.fillStyle = "#ffffffef";
    c.fillRect(30, 581, 1225, 110);
    c.fillStyle = "#267f98";
    c.font = "34px monospace";
    c.fillText(`${snapshot.speedKmh.toFixed(0)} km/h`, 54, 629);
    c.fillText(`${snapshot.rpm.toFixed(0)} RPM`, 340, 629);
    c.fillText(`Gear ${snapshot.gear}`, 635, 629);
    c.fillText(`${snapshot.elapsed.toFixed(2)} s`, 975, 629);
    c.font = "13px sans-serif";
    c.fillStyle = "#627b89";
    c.fillText(
      "Calculated vehicle performance · procedural sound · shared 4.0 L cutaway, motion slowed",
      54,
      663,
    );
  }

  private showClips() {
    this.gallery.replaceChildren();
    if (!this.clips.length) {
      const p = document.createElement("p");
      p.className = "record-empty";
      p.textContent =
        "Record a run to see it here. Recording starts the selected scenario from the beginning and includes its synthesized audio.";
      this.gallery.append(p);
    }
    for (const clip of this.clips) {
      const section = document.createElement("section"),
        title = document.createElement("h3"),
        video = document.createElement("video"),
        link = document.createElement("a");
      title.textContent = `${clip.title} · ${clip.seconds.toFixed(1)} s captured`;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = clip.url;
      // Streaming WebM can omit duration. A seek lets the browser derive its end.
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (video.duration === Infinity) {
            video.addEventListener(
              "seeked",
              () => {
                video.currentTime = 0;
              },
              { once: true },
            );
            video.currentTime = Number.MAX_SAFE_INTEGER;
          }
        },
        { once: true },
      );
      link.href = clip.url;
      link.download = clip.name;
      link.textContent = "Download video with sound";
      section.append(title, video, link);
      this.gallery.append(section);
    }
  }
}
