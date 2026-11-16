// Offline check of the C++ engine: renders every factory preset and prints peak / RMS.
#include "../Source/Engine.h"
#include "../Source/Presets.h"
#include <chrono>
#include <cstdio>
#include <cstring>
using namespace strain;
struct Stat { double pk = 0, rms = 0; long bad = 0; };
static Stat run (Engine& e, double secs) {
    float l[128], r[128]; Stat s; double sq = 0; long cnt = 0;
    for (long i = 0; i < (long) (secs * 48000); i += 128) { e.process (l, r, 128);
        for (int k = 0; k < 128; ++k) { if (! std::isfinite (l[k]) || ! std::isfinite (r[k])) ++s.bad; s.pk = std::max ({ s.pk, (double) std::abs (l[k]), (double) std::abs (r[k]) }); sq += l[k] * l[k] + r[k] * r[k]; cnt += 2; } }
    s.rms = std::sqrt (sq / cnt); return s; }
int main() {
    for (int i = 0; i < NUM_PRESETS; ++i) {
        Engine e; e.prepare (48000);
        for (int k = 0; k < P_COUNT; ++k) e.setParam (k, PARAMS[k].def);
        for (int k = 0; k < PRESETS[i].count; ++k) e.setParam (PRESETS[i].values[k].id, PRESETS[i].values[k].v);
        const bool bass = std::strcmp (PRESETS[i].category, "Bass") == 0; const int chord[4] = { 60, 64, 67, 71 };
        auto t0 = std::chrono::steady_clock::now();
        if (bass) e.keyDown (36, 0.8); else for (int n : chord) e.keyDown (n, 0.8);
        Stat a = run (e, 2);
        if (bass) e.keyUp (36); else for (int n : chord) e.keyUp (n);
        Stat b = run (e, 1.5);
        double ms = std::chrono::duration<double, std::milli> (std::chrono::steady_clock::now() - t0).count();
        std::printf ("%-16s pk %.2f rms %.3f tail %.3f bad %ld cpu%% %.1f\n", PRESETS[i].name, a.pk, a.rms, b.rms, a.bad + b.bad, ms / 35.0);
    }
    { Engine e; e.prepare (96000); e.setParam (P_arpOn, 1); e.setParam (P_vmode, 2); e.setParam (P_dlMix, .4); e.setParam (P_chMix, .4); e.setParam (P_phMix, .4);
      int8_t notes[8][8] = { { 45, 57, 60, 64 }, { 38, 57, 62, 65 } }; int8_t counts[8] = { 4, 4 }; e.setProgression (notes, counts, 2, 2);
      float l[512], r[512]; long bad = 0; double pk = 0; for (int i = 0; i < 1200; ++i) { e.process (l, r, 1 + (i * 37) % 511); for (int k = 0; k < 1 + (i * 37) % 511; ++k) { if (! std::isfinite (l[k])) ++bad; pk = std::max (pk, (double) std::abs (l[k])); } }
      e.stopProgression(); std::printf ("96k arp+prog odd blocks: pk %.2f bad %ld chord %d\n", pk, bad, e.chordIndex.load()); }
    return 0;
}
