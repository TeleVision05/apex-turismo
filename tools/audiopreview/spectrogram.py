#!/usr/bin/env python3
"""Render a spectrogram PNG for each rendered engine-preset WAV.

Reads the 4s full-throttle rpm-sweep WAVs written by the audio preview page
(tools/audiopreview/renders/<preset>.wav) and writes a spectrogram PNG next
to each one, so a harmonic comb rising with rpm can be inspected visually.

Usage: tools/tracks/.venv/bin/python3 tools/audiopreview/spectrogram.py
"""
import struct
import sys
import wave
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

RENDERS_DIR = Path(__file__).parent / "renders"


def read_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sample_rate = w.getframerate()
        n_frames = w.getnframes()
        raw = w.readframes(n_frames)
        samples = np.array(struct.unpack(f"<{n_frames}h", raw), dtype=np.float32) / 32768.0
    return samples, sample_rate


def plot_spectrogram(samples: np.ndarray, sample_rate: int, title: str, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=130)
    nfft = 2048
    spec, freqs, times, im = ax.specgram(
        samples,
        NFFT=nfft,
        Fs=sample_rate,
        noverlap=nfft // 2,
        cmap="magma",
        vmin=-100,
        vmax=-10,
    )
    ax.set_ylim(0, 6000)
    ax.set_xlabel("time (s)")
    ax.set_ylabel("frequency (Hz)")
    ax.set_title(title)
    fig.colorbar(im, ax=ax, label="dB")
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def main() -> None:
    wavs = sorted(RENDERS_DIR.glob("*.wav"))
    if not wavs:
        print(f"no .wav files found in {RENDERS_DIR}", file=sys.stderr)
        sys.exit(1)
    for wav_path in wavs:
        samples, sample_rate = read_wav_mono(wav_path)
        out_path = wav_path.with_suffix(".png")
        plot_spectrogram(samples, sample_rate, f"{wav_path.stem} — full-throttle rpm sweep", out_path)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
