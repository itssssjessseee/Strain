// Strain synthesis engine. Header-only, no framework dependencies.
// A line-for-line port of the JavaScript engine in ui/ (engine.js).
#pragma once
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>
#include "Params.h"

namespace strain {

constexpr double TAU = 6.283185307179586;
constexpr int NV = 12, TS = 2048, NT = 6, NF = 8, NM = 7, MAXHELD = 32;

inline double clp (double x, double a, double b) { return x < a ? a : x > b ? b : x; }
inline double fastTanh (double x) { if (x > 3) return 1; if (x < -3) return -1; const double x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
inline double polyBlep (double t, double dt)
{
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
}
// classic oscillator: sine -> saw -> pulse morph, band-limited
inline double classicValue (double ph, double inc, double sh, double w)
{
    const double saw = 2 * ph - 1 - polyBlep (ph, inc);
    if (sh < 0.5) { const double s = -std::sin (TAU * ph); return s + (saw - s) * sh * 2; }
    double p2 = ph + w; if (p2 >= 1) p2 -= 1;
    const double pul = saw - (2 * p2 - 1 - polyBlep (p2, inc));
    return saw + (pul - saw) * (sh - 0.5) * 2;
}

struct Env { double v = 0; int s = 0; };
inline double envStep (Env& e, double S, double ca, double cd, double cr)
{
    if (e.s == 1) { e.v += (1.25 - e.v) * ca; if (e.v >= 1) { e.v = 1; e.s = 2; } }
    else if (e.s == 2) { e.v += (S - e.v) * cd; }
    else if (e.s == 3) { e.v -= e.v * cr; if (e.v < 1e-4) { e.v = 0; e.s = 0; } }
    return e.v;
}
inline double svf (double* sv, double x, double k, double a1, double a2, double a3, int type, double bg)
{
    const double v3 = x - sv[1], v1 = a1 * sv[0] + a2 * v3, v2 = sv[1] + a2 * sv[0] + a3 * v3;
    sv[0] = 2 * v1 - sv[0]; sv[1] = 2 * v2 - sv[1];
    return type == 1 ? v2 : type == 2 ? v1 * bg : type == 3 ? x - k * v1 - v2 : x - k * v1;
}
inline double saturate (double x, int type, double g, double mk)
{
    switch (type)
    {
        case 1: return fastTanh (x * g) * mk;
        case 2: x *= g; return (x > 1 ? 1 : x < -1 ? -1 : x) * mk;
        case 3: return std::sin (x * g);
        case 4: return (std::abs (fastTanh (x * g)) - 0.35) * 1.4 * mk;
        case 5: return std::floor (x * g + 0.5) / g;
        default: return x;
    }
}

struct Rng
{
    uint32_t s = 0x9E3779B9u;
    double operator()() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s * (1.0 / 4294967296.0); }
};

//==============================================================================
// Wavetables: NT tables x NF frames x NM band-limited levels, TS+1 samples each.
class Wavetables
{
public:
    static const Wavetables& get() { static Wavetables w; return w; }
    const float* table (int t, int f, int m) const { return data.data() + (size_t) (((t * NF) + f) * NM + m) * (TS + 1); }

private:
    std::vector<float> data;

    static double amp (int t, double x, int h)
    {
        switch (t)
        {
            case 0: { const double c = 1 + x * x * 70, lp = 1 / (1 + std::pow (h / c, 4.0)), d = (h - c) / (0.2 * c + 0.6); return (1.0 / h) * lp * (1 + 1.5 * std::exp (-d * d)); }
            case 1:
            {
                static const double V[5][3] = { { 800, 1150, 2900 }, { 400, 2000, 2600 }, { 270, 2300, 3000 }, { 450, 800, 2830 }, { 325, 700, 2700 } };
                const double v = x * 4; const int i = std::min (3, (int) std::floor (v)); const double f = v - i, fr = h * 110.0; double a = 0;
                for (int k = 0; k < 3; ++k) { const double F = V[i][k] + (V[i + 1][k] - V[i][k]) * f, bw = 90 + k * 40 + F * 0.04, d = (fr - F) / bw; a += std::exp (-d * d) * (k == 0 ? 1 : k == 1 ? 0.6 : 0.3); }
                return a + (h == 1 ? 0.35 : h == 2 ? 0.15 : 0.01 / h);
            }
            case 2: { const double d = 0.5 - x * 0.45; return std::sin (3.141592653589793 * h * d) / h; }
            case 3:
            {
                static const int B[8] = { 1, 3, 5, 9, 13, 19, 27, 37 };
                for (int i = 0; i < 8; ++i) if (B[i] == h) return std::exp (-i * (1.3 - x * 1.1)) * (i % 2 ? 0.8 : 1.0);
                return 0;
            }
            case 4: { const double c = 0.5 + 0.5 * std::cos (h * (0.35 + x * 2.6)); return c * c / std::pow ((double) h, 0.8); }
            default:
            {
                static const int D[9] = { 1, 2, 3, 4, 6, 8, 10, 12, 16 };
                const double w[9] = { 1, 0.9 - x * 0.5, 0.3 + x * 0.6, x * 0.9, 0.5 * x, x * x, 0.4 * x * x, 0.3 * x * x, 0.5 * x * x * x + 0.02 };
                for (int i = 0; i < 9; ++i) if (D[i] == h) return w[i];
                return 0;
            }
        }
    }

    Wavetables()
    {
        data.assign ((size_t) NT * NF * NM * (TS + 1), 0.0f);
        std::vector<float> sinT (TS), acc (TS);
        for (int i = 0; i < TS; ++i) sinT[(size_t) i] = (float) std::sin (TAU * i / TS);
        for (int t = 0; t < NT; ++t)
            for (int f = 0; f < NF; ++f)
            {
                const double x = f / double (NF - 1);
                std::fill (acc.begin(), acc.end(), 0.0f);
                int h = 1;
                for (int m = NM - 1; m >= 0; --m)
                {
                    const int H = 256 >> m;
                    for (; h <= H; ++h)
                    {
                        const float a = (float) amp (t, x, h);
                        if (std::abs (a) < 1e-5f) continue;
                        for (int i = 0, j = 0; i < TS; ++i) { acc[(size_t) i] += a * sinT[(size_t) j]; j = (j + h) & (TS - 1); }
                    }
                    float* b = const_cast<float*> (table (t, f, m));
                    std::memcpy (b, acc.data(), sizeof (float) * TS); b[TS] = acc[0];
                }
                const float* top = table (t, f, 0);
                double pk = 0, sq = 0;
                for (int i = 0; i < TS; ++i) { const double a = top[i]; sq += a * a; pk = std::max (pk, std::abs (a)); }
                const double rms = std::sqrt (sq / TS), g = std::min (1.5 / (pk > 0 ? pk : 1), 0.5 / (rms > 0 ? rms : 1));
                for (int m = 0; m < NM; ++m) { float* b = const_cast<float*> (table (t, f, m)); for (int i = 0; i <= TS; ++i) b[i] = (float) (b[i] * g); }
            }
    }
};

//==============================================================================
struct Osc
{
    double ph = 0, z = 0, nm = 1, ff = 0, pw = 0.5;
    int w = 0;
    double hp[7] = {}, hi[7] = {};
    const float* tA = nullptr; const float* tB = nullptr;
};

inline double oscTick (Osc& q, int m, double f, double s, double w)
{
    if (m == 0)
    {
        double ph = q.ph + f;
        if (ph >= 1 || ph < 0) { q.w = ph >= 1 ? 1 : 0; ph -= std::floor (ph); } else q.w = 0;
        q.ph = ph;
        const double a = f < 0 ? -f : f;
        return classicValue (ph, a > 0.49 ? 0.49 : a, s, w);
    }
    if (m == 1)
    {
        double sum = 0;
        for (int k = 0; k < 7; ++k)
        {
            const double d = q.hi[k]; double ph = q.hp[k] + d;
            if (ph >= 1) { ph -= 1; if (k == 0) q.w = 1; } else if (k == 0) q.w = 0;
            q.hp[k] = ph; double v = 2 * ph - 1;
            if (ph < d) { const double t = ph / d; v -= t + t - t * t - 1; }
            else if (ph > 1 - d) { const double t = (ph - 1) / d; v -= t * t + t + t + 1; }
            sum += k ? v * s : v;
        }
        q.ph = q.hp[0];
        return sum * q.nm;
    }
    double ph = q.ph + f;
    if (ph >= 1 || ph < 0) { q.w = ph >= 1 ? 1 : 0; ph -= std::floor (ph); } else q.w = 0;
    q.ph = ph;
    const double pw = q.pw, pd = ph < pw ? ph * 0.5 / pw : 0.5 + (ph - pw) * 0.5 / (1 - pw), x = pd * TS;
    const int i = (int) x; const double fr = x - i;
    const double a = q.tA[i] + (q.tA[i + 1] - q.tA[i]) * fr;
    return a + (q.tB[i] + (q.tB[i + 1] - q.tB[i]) * fr - a) * q.ff;
}

class Engine;

struct Voice
{
    bool on = false, gate = false;
    int key = -1; double note = 60, cur = 60, vel = 0, age = 0, pan = 0, ud = 0, rnd = 0, slide = 0;
    uint64_t id = 0;
    Osc o[3];
    double sp = 0, nz = 0, dr = 0, drT = 0, drG = 0;
    Env aE, fE, mE;
    double ld[4] = {}, sv[4] = {}, md[24] = {};

    void start (Engine& e, int n, double velocity, int k, int u, bool leg, bool poly);
    void release() { gate = false; if (aE.s) aE.s = 3; if (fE.s) fE.s = 3; if (mE.s) mE.s = 3; }
    void render (Engine& e, float* L, float* R, int off, int n);
};

//==============================================================================
class Engine
{
public:
    double p[P_COUNT] = {};
    double sr = 48000, hostBpm = 0, bend = 0, mw = 0;
    std::atomic<int> chordIndex { -1 };

    Engine() { for (int i = 0; i < P_COUNT; ++i) p[i] = PARAMS[i].def; }

    void prepare (double sampleRate)
    {
        sr = sampleRate; wt = &Wavetables::get();
        const size_t dn = sr > 50000 ? (sr > 100000 ? 524288u : 262144u) : 131072u;
        d0.assign (dn, 0.0f); d1.assign (dn, 0.0f); dm = (int) dn - 1; dw = 0; dT = sr * 0.3;
        rmask = sr > 100000 ? 65535 : 16383;
        for (auto& b : rb) b.assign ((size_t) rmask + 1, 0.0f);
        amask = sr > 100000 ? 4095 : 1023;
        static const int AL[4] = { 142, 379, 107, 277 };
        for (int i = 0; i < 4; ++i) { ab[i].assign ((size_t) amask + 1, 0.0f); al[i] = std::min (amask - 24, (int) std::lround (AL[i] * sr / 48000)); }
        cmask = sr > 100000 ? 16383 : 4095;
        cb0.assign ((size_t) cmask + 1, 0.0f); cb1.assign ((size_t) cmask + 1, 0.0f);
        rsz = -1; dirty = true;
        reset();
    }

    void reset()
    {
        for (auto& v : voices) { v.on = false; v.gate = false; }
        nHeld = 0; nOff = 0; nStack = 0; phys = 0; nProgNotes = 0; progOn = false; chordIndex = -1;
        std::fill (d0.begin(), d0.end(), 0.0f); std::fill (d1.begin(), d1.end(), 0.0f);
        for (auto& b : rb) std::fill (b.begin(), b.end(), 0.0f);
        for (auto& b : ab) std::fill (b.begin(), b.end(), 0.0f);
        std::fill (cb0.begin(), cb0.end(), 0.0f); std::fill (cb1.begin(), cb1.end(), 0.0f);
        std::fill (rs, rs + 8, 0.0); std::fill (ps, ps + 12, 0.0);
        pf0 = pf1 = dlL = dlR = dhL = dhR = bl = br = dxl = dxr = dyl = dyr = 0;
    }

    double bpm() const { return hostBpm > 20 ? hostBpm : p[P_bpm]; }

    void setParam (int k, double v)
    {
        const double was = p[k]; if (was == v) return;
        p[k] = v; dirty = true;
        if (k == P_arpOn) panic();
        if (k == P_arpHold && v == 0) { nHeld = 0; phys = 0; }
    }

    void panic() { for (auto& v : voices) if (v.on) v.release(); nHeld = 0; nOff = 0; nStack = 0; phys = 0; }

    //--- keys ---
    void keyDown (int n, double v)
    {
        if (p[P_arpOn] > 0)
        {
            if (p[P_arpHold] > 0 && phys == 0) nHeld = 0;
            ++phys;
            if (nHeld == 0) { aT = 0; aS = 0; aN = 0; }
            for (int i = 0; i < nHeld; ++i) if (held[i].n == n) return;
            if (nHeld < MAXHELD) held[nHeld++] = { n, v };
        }
        else noteOn (n, v);
    }
    void keyUp (int n)
    {
        if (p[P_arpOn] > 0)
        {
            phys = std::max (0, phys - 1);
            if (! (p[P_arpHold] > 0))
                for (int i = 0; i < nHeld; ++i) if (held[i].n == n) { for (int j = i; j < nHeld - 1; ++j) held[j] = held[j + 1]; --nHeld; break; }
        }
        else noteOff (n);
    }
    void setSlide (int n, double v) { for (auto& vc : voices) if (vc.on && vc.key == n) vc.slide = v; }
    void setSlideAll (double v) { for (auto& vc : voices) if (vc.on) vc.slide = v; }

    //--- chord progression player ---
    void setProgression (const int8_t notes[8][8], const int8_t counts[8], int numChords, double beatsPerChord)
    {
        stopProgression();
        if (numChords <= 0) return;
        nProg = std::min (8, numChords);
        for (int c = 0; c < nProg; ++c) { progCount[c] = std::min<int> (8, counts[c]); for (int i = 0; i < progCount[c]; ++i) prog[c][i] = notes[c][i]; }
        progLen = beatsPerChord; progI = -1; progT = 0; progOn = true;
    }
    void stopProgression()
    {
        if (! progOn) return;
        for (int i = 0; i < nProgNotes; ++i) keyUp (progNotes[i]);
        nProgNotes = 0; progOn = false; chordIndex = -1;
        if (p[P_arpOn] > 0) nHeld = 0;
    }

    //--- audio ---
    void process (float* L, float* R, int n)
    {
        for (int i = 0; i < n; i += 16)
        {
            const int m = std::min (16, n - i);
            tick (m);
            for (int j = i; j < i + m; ++j) { L[j] = 0; R[j] = 0; }
            for (auto& v : voices) if (v.on) v.render (*this, L, R, i, m);
            fx (L, R, i, m);
        }
    }

private:
    friend struct Voice;
    struct Held { int n; double v; };
    struct Pending { int n; double t; };
    struct Slot { int s, d; double a; };

    const Wavetables* wt = nullptr;
    Voice voices[NV];
    Rng rng;
    uint64_t vid = 0; int last = -1; uint32_t seed = 12345;
    int stack[64] = {}, nStack = 0;
    Held held[MAXHELD] = {}; int nHeld = 0, phys = 0;
    Pending poff[64] = {}; int nOff = 0;
    bool dirty = true;
    int om[3] = {}, owt[3] = {}; double osh[3] = {}, owp[3] = {}, ose[3] = {}, ode[3] = {}, olv[3] = {};
    double tI[3] = {}, tL[3] = {}, tS[3] = {}, tW[3] = {};
    Slot slots[8] = {}; int nSlots = 0; int ap[16] = {};
    double lfo[3] = {}, lp[3] = {}, lh[3] = {}, ln[3] = {};
    double sC1 = 0.7, sC2 = 0.5, sV = 0.7;
    double caA = 0, caD = 0, caR = 0, cfA = 0, cfD = 0, cfR = 0, cmA = 0, cmD = 0, cmR = 0, glc = 1, fadeN = 0;
    double aT = 0; int aS = 0, aN = 0;
    int8_t prog[8][8] = {}; int progCount[8] = {}, nProg = 0, progNotes[8] = {}, nProgNotes = 0, progI = -1; bool progOn = false; double progT = 0, progLen = 4;
    std::vector<float> cb0, cb1, d0, d1, rb[8], ab[4];
    int cmask = 4095, cw = 0, dm = 131071, dw = 0, rmask = 16383, rw = 0, amask = 1023, aw = 0, rl[8] = {}, al[4] = {};
    double cp = 0, ps[12] = {}, pf0 = 0, pf1 = 0, pp = 0, dT = 14400, dlL = 0, dlR = 0, dhL = 0, dhR = 0;
    double rg[8] = {}, rs[8] = {}, ro[8] = {}, rsz = -1, bl = 0, br = 0, dxl = 0, dxr = 0, dyl = 0, dyr = 0;

    void derive()
    {
        dirty = false;
        for (int i = 0; i < 3; ++i)
        {
            const int b = P_o1mode + i * 7;
            om[i] = (int) p[b]; owt[i] = (int) clp (p[b + 1], 0, NT - 1); osh[i] = p[b + 2]; owp[i] = p[b + 3]; ose[i] = p[b + 4]; ode[i] = p[b + 5]; olv[i] = p[b + 6];
        }
        nSlots = 0;
        for (int j = 0; j < 8; ++j)
        {
            const int s = (int) p[P_m0s + j * 3], d = (int) p[P_m0s + j * 3 + 1]; const double a = p[P_m0s + j * 3 + 2];
            if (s && d && a != 0) slots[nSlots++] = { s, d, d <= 3 ? a * std::abs (a) * 24 : a };
        }
        for (int i = 0; i < 16; ++i) ap[i] = (int) p[P_ap0 + i];
        auto T = [] (double x) { return 0.001 * std::pow (10000.0, x); };
        const double ds = 1 / sr, dc = 16 / sr;
        auto c = [&] (double dt, double k, double x) { return 1 - std::exp (-dt * k / T (x)); };
        caA = c (ds, 1.6, p[P_aA]); caD = c (ds, 4, p[P_aD]); caR = c (ds, 5, p[P_aR]);
        cfA = c (dc, 1.6, p[P_fA]); cfD = c (dc, 4, p[P_fD]); cfR = c (dc, 5, p[P_fR]);
        cmA = c (dc, 1.6, p[P_mA]); cmD = c (dc, 4, p[P_mD]); cmR = c (dc, 5, p[P_mR]);
        glc = p[P_glide] > 0 ? 1 - std::exp (-dc / (0.004 + p[P_glide] * p[P_glide] * 1.2)) : 1;
        fadeN = p[P_l1fade] > 0 ? p[P_l1fade] * p[P_l1fade] * 3 * sr : 0;
        if (p[P_rvSize] != rsz)
        {
            rsz = p[P_rvSize]; const double rt = 0.4 + rsz * rsz * 10;
            static const int RVB[8] = { 1153, 1327, 1559, 1801, 2069, 2311, 2617, 2903 };
            for (int k = 0; k < 8; ++k) { const int l = std::min (rmask - 300, (int) std::lround (RVB[k] * (0.6 + rsz * 0.9) * sr / 48000)); rl[k] = l; rg[k] = std::pow (10.0, -3.0 * l / (rt * sr)); }
        }
    }

    void noteOn (int n, double vel)
    {
        const int u = (int) clp ((int) p[P_uni], 1, 4), vm = (int) p[P_vmode];
        if (vm == 0)
        {
            nStack = 0;
            Voice* got[4] = {}; int ng = 0, matching = 0;
            for (auto& v : voices) if (v.on && v.key == n) { if (ng < 4) got[ng++] = &v; ++matching; }
            if (matching != u)
            {
                for (auto& v : voices) if (v.on && v.key == n) v.release();
                ng = 0;
                for (int k = 0; k < u; ++k)
                {
                    Voice* best = nullptr; double bs = 1e30;
                    for (auto& v : voices)
                    {
                        bool taken = false; for (int g = 0; g < ng; ++g) if (got[g] == &v) taken = true;
                        if (taken) continue;
                        const double s = ! v.on ? -1 : ! v.gate ? v.aE.v : 1e6 + (double) v.id;
                        if (s < bs) { bs = s; best = &v; }
                    }
                    got[ng++] = best;
                }
            }
            for (int k = 0; k < u; ++k) got[k]->start (*this, n, vel, k, u, false, true);
        }
        else
        {
            for (int i = 0; i < nStack; ++i) if (stack[i] == n) { for (int j = i; j < nStack - 1; ++j) stack[j] = stack[j + 1]; --nStack; break; }
            if (nStack < 64) stack[nStack++] = n;
            const bool leg = vm == 2 && nStack > 1;
            for (int k = 0; k < NV; ++k)
            {
                auto& v = voices[k];
                if (k < u) v.start (*this, n, vel, k, u, leg && v.on && v.gate, false);
                else if (v.on && v.gate) v.release();
            }
        }
        last = n;
    }

    void noteOff (int n)
    {
        if ((int) p[P_vmode] == 0) { for (auto& v : voices) if (v.on && v.gate && v.key == n) v.release(); return; }
        int i = -1; for (int j = 0; j < nStack; ++j) if (stack[j] == n) { i = j; break; }
        if (i < 0) return;
        for (int j = i; j < nStack - 1; ++j) stack[j] = stack[j + 1];
        --nStack;
        if (i == nStack)
        {
            if (nStack > 0)
            {
                const int m = stack[nStack - 1];
                for (auto& v : voices) if (v.on && v.gate) { v.key = m; v.note = m; if (! (p[P_glide] > 0)) v.cur = m; }
                last = m;
            }
            else for (auto& v : voices) if (v.on && v.gate) v.release();
        }
    }

    void arpPlay (int n, double v, int pv, double gate)
    {
        if (n > 120) return;
        for (int i = nOff - 1; i >= 0; --i) if (poff[i].n == n) { poff[i] = poff[nOff - 1]; --nOff; }
        noteOn (n, pv == 2 ? std::min (1.0, v * 1.2 + 0.12) : v * 0.72);
        if (nOff < 64) poff[nOff++] = { n, gate };
    }

    void arp (int m)
    {
        static const double ARPDIV[6] = { 1, 0.5, 1.0 / 3, 0.25, 1.0 / 6, 0.125 };
        for (int i = nOff - 1; i >= 0; --i) if ((poff[i].t -= m) <= 0) { const int n = poff[i].n; poff[i] = poff[nOff - 1]; --nOff; noteOff (n); }
        const int hl = nHeld; if (! hl) return;
        if ((aT -= m) > 0) return;
        const int si = aS++; const double spb = sr * 60 / bpm(), sw = p[P_arpSwing] * 0.5;
        const double len = spb * ARPDIV[(int) clp (p[P_arpDiv], 0, 5)] * ((si & 1) ? 1 - sw : 1 + sw); aT += len;
        const int pv = ap[si & 15]; if (! pv) return;
        const int mode = (int) p[P_arpMode], oct = (int) clp ((int) p[P_arpOct], 1, 4); const double gate = len * (0.08 + p[P_arpGate] * 0.95);
        Held hs[MAXHELD]; std::copy (held, held + hl, hs);
        if (mode != 4) std::stable_sort (hs, hs + hl, [] (const Held& a, const Held& b) { return a.n < b.n; });
        if (mode == 5) { for (int i = 0; i < hl; ++i) arpPlay (hs[i].n, hs[i].v, pv, gate); return; }
        const int Ln = hl * oct; int k = aN++;
        if (mode == 1) k = Ln - 1 - (k % Ln);
        else if (mode == 2) { const int per = std::max (1, 2 * Ln - 2); k %= per; if (k >= Ln) k = per - k; }
        else if (mode == 3) k = (int) (rng() * Ln);
        else k %= Ln;
        arpPlay (hs[k % hl].n + 12 * (k / hl), hs[k % hl].v, pv, gate);
    }

    void tick (int m)
    {
        static const double LFB[9] = { 16, 8, 4, 3, 2, 1, 0.5, 0.25, 0.125 };
        if (dirty) derive();
        sC1 += (p[P_f1cut] - sC1) * 0.25; sC2 += (p[P_f2cut] - sC2) * 0.25; sV += (p[P_vol] - sV) * 0.1;
        for (int i = 0; i < 3; ++i)
        {
            const int b = P_l1shape + i * 3; const double x = p[b + 1];
            const double rate = p[b + 2] > 0 ? (bpm() / 60) / LFB[(int) clp (std::floor (x * 8 + 0.5), 0, 8)] : 0.02 * std::pow (1500.0, x);
            double ph = lp[i] + rate * m / sr;
            if (ph >= 1) { ph -= std::floor (ph); lh[i] = ln[i]; ln[i] = rng() * 2 - 1; }
            lp[i] = ph; double v;
            switch ((int) p[b])
            {
                case 0: v = std::sin (TAU * ph); break;
                case 1: v = 4 * std::abs (ph - 0.5) - 1; break;
                case 2: v = 1 - 2 * ph; break;
                case 3: v = ph < 0.5 ? 1 : -1; break;
                case 4: v = ln[i]; break;
                default: { const double c = (1 - std::cos (3.141592653589793 * ph)) * 0.5; v = lh[i] + (ln[i] - lh[i]) * c; }
            }
            lfo[i] = v;
        }
        if (progOn && (progT -= m) <= 0)
        {
            for (int i = 0; i < nProgNotes; ++i) keyUp (progNotes[i]);
            progI = (progI + 1) % nProg; nProgNotes = progCount[progI];
            for (int i = 0; i < nProgNotes; ++i) { progNotes[i] = prog[progI][i]; keyDown (progNotes[i], 0.72); }
            progT += progLen * sr * 60 / bpm(); chordIndex = progI;
        }
        if (p[P_arpOn] > 0) arp (m);
    }

    void fx (float* L, float* R, int off, int n)
    {
        static const double DLB[8] = { 0.25, 0.5, 0.75, 1, 1.5, 2, 1.0 / 3, 2.0 / 3 };
        const double PI = 3.141592653589793;
        const double bb = p[P_boost] * 1.5, bc = 1 - std::exp (-TAU * 110 / sr);
        const double cm = p[P_chMix], cr = 0.1 * std::pow (50.0, p[P_chRate]) / sr, cd = p[P_chDepth] * 0.006 * sr, c0 = 0.012 * sr, csz = cmask + 1;
        const double pm = p[P_phMix], pfb = p[P_phFb] * 0.75; double pa0 = 0, pa1 = 0;
        if (pm > 0)
        {
            pp += 0.05 * std::pow (100.0, p[P_phRate]) * n / sr; pp -= std::floor (pp);
            double t = std::tan (PI * clp (700 * std::pow (2.0, std::sin (TAU * pp) * p[P_phDepth] * 2.2), 40, sr * 0.4) / sr); pa0 = (t - 1) / (t + 1);
            t = std::tan (PI * clp (700 * std::pow (2.0, std::sin (TAU * (pp + 0.25)) * p[P_phDepth] * 2.2), 40, sr * 0.4) / sr); pa1 = (t - 1) / (t + 1);
        }
        const double dmx = p[P_dlMix], dfb = p[P_dlFb] * 0.92, dtg = std::min ((double) dm - 4, DLB[(int) clp (p[P_dlTime], 0, 7)] * 60 / bpm() * sr), dlc = 0.04 + p[P_dlTone] * p[P_dlTone] * 0.9;
        const bool ping = p[P_dlPing] > 0;
        const double rm = p[P_rvMix], rdc = 1 - p[P_rvDamp] * 0.85, vol = sV * sV * 2.6;
        for (int j = off; j < off + n; ++j)
        {
            double l = L[j], r = R[j];
            if (bb > 0) { bl += (l - bl) * bc; br += (r - br) * bc; l += bl * bb; r += br * bb; }
            if (cm > 0)
            {
                const int w = cw; cb0[(size_t) w] = (float) l; cb1[(size_t) w] = (float) r;
                cp += cr; if (cp >= 1) cp -= 1;
                double x = w - (c0 + cd * std::sin (TAU * cp)); if (x < 0) x += csz; int i = (int) x; double f = x - i;
                const double wl = cb0[(size_t) i] + (cb0[(size_t) ((i + 1) & cmask)] - cb0[(size_t) i]) * f;
                x = w - (c0 + cd * std::cos (TAU * cp)); if (x < 0) x += csz; i = (int) x; f = x - i;
                const double wr = cb1[(size_t) i] + (cb1[(size_t) ((i + 1) & cmask)] - cb1[(size_t) i]) * f;
                l = l * (1 - cm * 0.3) + wl * cm * 0.8; r = r * (1 - cm * 0.3) + wr * cm * 0.8; cw = (w + 1) & cmask;
            }
            if (pm > 0)
            {
                double x = l + pf0 * pfb; for (int k = 0; k < 6; ++k) { const double y = pa0 * x + ps[k]; ps[k] = x - pa0 * y; x = y; } pf0 = x; l = (l + x * pm) * (1 - pm * 0.25);
                x = r + pf1 * pfb; for (int k = 6; k < 12; ++k) { const double y = pa1 * x + ps[k]; ps[k] = x - pa1 * y; x = y; } pf1 = x; r = (r + x * pm) * (1 - pm * 0.25);
            }
            if (dmx > 0)
            {
                dT += (dtg - dT) * 0.0004; const int w = dw; double x = w - dT; if (x < 0) x += dm + 1;
                const int i = (int) x; const double f = x - i; const size_t i0 = (size_t) (i & dm), i1 = (size_t) ((i + 1) & dm);
                const double yl = d0[i0] + (d0[i1] - d0[i0]) * f, yr = d1[i0] + (d1[i1] - d1[i0]) * f;
                dlL += (yl - dlL) * dlc; dlR += (yr - dlR) * dlc; dhL += (dlL - dhL) * 0.012; dhR += (dlR - dhR) * 0.012;
                const double fl = dlL - dhL + 1e-15, fr = dlR - dhR + 1e-15;
                if (ping) { d0[(size_t) w] = (float) ((l + r) * 0.5 + fr * dfb); d1[(size_t) w] = (float) (fl * dfb); }
                else { d0[(size_t) w] = (float) (l + fl * dfb); d1[(size_t) w] = (float) (r + fr * dfb); }
                dw = (w + 1) & dm; l += yl * dmx; r += yr * dmx;
            }
            if (rm > 0)
            {
                double xl = l + 1e-15, xr = r + 1e-15;
                for (int a = 0; a < 4; ++a)
                {
                    double& x = a < 2 ? xl : xr; auto& b = ab[a];
                    const double d = b[(size_t) ((aw - al[a]) & amask)], y = d - 0.6 * x; b[(size_t) aw] = (float) (x + 0.6 * y); x = y;
                }
                aw = (aw + 1) & amask;
                double sum = 0;
                for (int k = 0; k < 8; ++k) { const double o = rb[k][(size_t) ((rw - rl[k]) & rmask)], s = rs[k] + (o - rs[k]) * rdc; rs[k] = s; ro[k] = s; sum += s; }
                sum *= 0.25;
                for (int k = 0; k < 8; ++k) rb[k][(size_t) rw] = (float) (((k & 1) ? xr : xl) + (ro[k] - sum) * rg[k]);
                rw = (rw + 1) & rmask;
                l = l * (1 - rm * 0.35) + (ro[0] - ro[2] + ro[4] - ro[6]) * 0.4 * rm; r = r * (1 - rm * 0.35) + (ro[1] - ro[3] + ro[5] - ro[7]) * 0.4 * rm;
            }
            l *= vol; r *= vol;
            const double yl = l - dxl + 0.9975 * dyl; dxl = l; dyl = yl;
            const double yr = r - dxr + 0.9975 * dyr; dxr = r; dyr = yr;
            L[j] = (float) fastTanh (yl); R[j] = (float) fastTanh (yr);
        }
    }
};

//==============================================================================
inline void Voice::start (Engine& e, int n, double velocity, int k, int u, bool leg, bool poly)
{
    const bool fresh = ! on;
    key = n; note = n; vel = velocity; gate = true; id = ++e.vid;
    ud = u > 1 ? k / double (u - 1) * 2 - 1 : 0; pan = ud;
    if (e.p[P_glide] > 0 && e.last >= 0) { if (fresh || poly) cur = e.last; } else cur = n;
    if (fresh)
    {
        aE.v = fE.v = mE.v = 0; std::fill (ld, ld + 4, 0.0); std::fill (sv, sv + 4, 0.0); nz = 0; sp = 0; slide = 0; dr = 0;
        for (auto& q : o) { q.ph = u > 1 ? e.rng() : 0; q.z = 0; for (auto& h : q.hp) h = e.rng(); }
    }
    if (! leg) { aE.s = fE.s = mE.s = 1; age = 0; rnd = e.rng() * 2 - 1; }
    on = true;
}

inline void Voice::render (Engine& e, float* L, float* R, int off, int n)
{
    static const double HC[7] = { 0, -1, 1, -0.57, 0.57, -0.18, 0.18 };
    const double* p = e.p; const double sr = e.sr;
    age += n;
    const double fEv = envStep (fE, p[P_fS], e.cfA, e.cfD, e.cfR), mEv = envStep (mE, p[P_mS], e.cmA, e.cmD, e.cmR);
    std::fill (md, md + 24, 0.0);
    if (e.nSlots)
    {
        const double fd = e.fadeN > 0 ? std::min (1.0, age / e.fadeN) : 1;
        for (int j = 0; j < e.nSlots; ++j)
        {
            const auto& s = e.slots[j]; double x;
            switch (s.s)
            {
                case 1: x = e.lfo[0] * fd; break; case 2: x = e.lfo[1]; break; case 3: x = e.lfo[2]; break; case 4: x = fEv; break; case 5: x = mEv; break;
                case 6: x = vel; break; case 7: x = (cur - 60) / 24; break; case 8: x = e.mw; break; case 9: x = slide; break; case 10: x = rnd; break; default: x = aE.v;
            }
            md[s.d] += x * s.a;
        }
    }
    cur += (note - cur) * e.glc;
    if ((drT -= n) <= 0) { drG = e.rng() * 2 - 1; drT = sr * (0.15 + e.rng() * 0.5); }
    dr += (drG - dr) * 0.004;
    const double base = cur + e.bend * 2 + md[1] + ud * p[P_udet] * 0.45 + dr * p[P_drift] * 0.2;
    double* inc = e.tI; double* lv = e.tL; double* sh = e.tS; double* wp = e.tW; const int* om = e.om;
    for (int i = 0; i < 3; ++i)
    {
        const double st = base + e.ose[i] + e.ode[i] * 0.5 + (i == 1 ? md[2] : i == 2 ? md[3] : 0);
        double f = 440 * std::pow (2.0, (st - 69) / 12) / sr; if (f > 0.45) f = 0.45;
        inc[i] = f; lv[i] = clp (e.olv[i] + md[15 + i], 0, 1); sh[i] = clp (e.osh[i] + md[4 + i], 0, 1);
        const double w = clp (e.owp[i] + md[7], 0, 1); Osc& q = o[i]; const int m = om[i];
        if (m == 0) wp[i] = 0.5 + w * 0.45;
        else if (m == 1) { const double d = w * w * 0.06 + 0.0004; for (int k = 0; k < 7; ++k) q.hi[k] = f * (1 + d * HC[k]); q.nm = 0.9 / std::sqrt (1 + 6 * sh[i] * sh[i]); }
        else
        {
            const double pos = sh[i] * (NF - 1); int f0 = (int) pos; if (f0 > NF - 2) f0 = NF - 2; q.ff = pos - f0;
            int mm = (int) std::ceil (std::log2 (512 * f)); mm = mm < 0 ? 0 : mm > NM - 1 ? NM - 1 : mm;
            q.tA = e.wt->table (e.owt[i], f0, mm); q.tB = e.wt->table (e.owt[i], f0 + 1, mm); q.pw = 0.5 - w * 0.45;
        }
    }
    const double fm = clp (p[P_fm] * p[P_fm] * 8 + md[8] * 8, 0, 12), ring = p[P_ring]; const bool sync = p[P_sync] > 0 && om[1] == 0;
    const double l1 = lv[0], l2 = lv[1], l3 = lv[2], ls = clp (p[P_sub] + md[20], 0, 1), ln = clp (p[P_noise] + md[18], 0, 1);
    const bool on2 = l2 > 0 || ring > 0, on1 = l1 > 0 || ring > 0 || (on2 && (fm > 0 || sync)), on3 = l3 > 0;
    const int m1 = om[0], m2 = om[1], m3 = om[2]; const double i1 = inc[0], i2b = inc[1], i3 = inc[2], s1 = sh[0], s2 = sh[1], s3 = sh[2], w1 = wp[0], w2 = wp[1], w3 = wp[2];
    Osc& o1 = o[0]; Osc& o2 = o[1]; Osc& o3 = o[2]; const double subI = i1 * 0.5, nc = 0.02 + p[P_ncol] * p[P_ncol] * 0.98;
    const double PI = 3.141592653589793, kt = (cur - 60) / 12;
    double fc = clp (20 * std::pow (2.0, e.sC1 * 10 + p[P_f1env] * fEv * 8 + p[P_f1key] * kt + md[9] * 8), 20, sr * 0.45);
    const double g1 = std::tan (PI * fc / sr), r1 = clp (p[P_f1res] + md[11], 0, 1); const int t1 = (int) p[P_f1type];
    double G = 0, G2 = 0, G3 = 0, G4 = 0, k1 = 0, lg = 1, a11 = 0, a12 = 0, a13 = 0, bg1 = 1;
    if (t1 == 0) { G = g1 / (1 + g1); G2 = G * G; G3 = G2 * G; G4 = G3 * G; k1 = r1 * 4.2; lg = 1.7 * (1 + k1 * 0.15); }
    else { k1 = 2 - 1.92 * r1; a11 = 1 / (1 + g1 * (g1 + k1)); a12 = g1 * a11; a13 = g1 * a12; bg1 = 0.5 + 0.5 * k1; }
    const int t2 = (int) p[P_f2type]; double k2 = 0, a21 = 0, a22 = 0, a23 = 0, bg2 = 1;
    if (t2)
    {
        fc = clp (20 * std::pow (2.0, e.sC2 * 10 + p[P_f2env] * fEv * 8 + p[P_f2key] * kt + (md[9] + md[10]) * 8), 20, sr * 0.45);
        const double g2 = std::tan (PI * fc / sr); k2 = 2 - 1.92 * clp (p[P_f2res], 0, 1); a21 = 1 / (1 + g2 * (g2 + k2)); a22 = g2 * a21; a23 = g2 * a22; bg2 = 0.5 + 0.5 * k2;
    }
    const int route = (int) p[P_route]; const double bal = clp (p[P_fbal] + md[12], -1, 1), bp = bal > 0 ? bal : 0, bn = bal < 0 ? -bal : 0, bm = (bal + 1) * 0.5, ga = std::min (1.0, 2 - 2 * bm), gb = std::min (1.0, 2 * bm);
    const int st = (int) p[P_satType]; const double drv = clp (p[P_drive] + md[19], 0, 1), sg = st == 5 ? std::pow (2.0, 7 - drv * 6) : 1 + drv * drv * 24, smk = 1 / (1 + drv * 1.2);
    const int u = (int) clp ((int) p[P_uni], 1, 4); const double ag = (1 - p[P_velAmp] + p[P_velAmp] * vel) * clp (1 + md[13], 0, 2) * 0.42 / std::sqrt ((double) u);
    const double pn = clp (pan * p[P_uspread] + md[14], -1, 1), gl = std::cos ((pn + 1) * 0.7853981634) * ag, gr = std::sin ((pn + 1) * 0.7853981634) * ag;
    const double aS = p[P_aS], caA = e.caA, caD = e.caD, caR = e.caR;
    for (int i = 0; i < n; ++i)
    {
        const double a = envStep (aE, aS, caA, caD, caR);
        double x1 = 0, x2 = 0, x3 = 0;
        if (on1) x1 = oscTick (o1, m1, i1, s1, w1);
        if (on2)
        {
            const double f2 = fm > 0 ? i2b * (1 + fm * x1) : i2b;
            if (sync)
            {
                double ph = o2.ph + f2; if (ph >= 1 || ph < 0) ph -= std::floor (ph);
                const double af = f2 < 0 ? -f2 : f2, ai = af > 0.49 ? 0.49 : af; double v = classicValue (ph, ai, s2, w2);
                if (o1.w) { const double t = o1.ph / i1; double np = t * f2; np -= std::floor (np); const double vr = classicValue (np, ai, s2, w2), h = vr - v; o2.z += h * t * t * 0.5; v = vr - h * (1 - t) * (1 - t) * 0.5; ph = np; }
                o2.ph = ph; x2 = o2.z; o2.z = v;
            }
            else x2 = oscTick (o2, m2, f2, s2, w2);
        }
        if (on3) x3 = oscTick (o3, m3, i3, s3, w3);
        double A = x1 * l1, B = x2 * l2 + x3 * l3 + x1 * x2 * ring;
        if (ls > 0) { sp += subI; if (sp >= 1) sp -= 1; A += std::sin (TAU * sp) * ls; }
        if (ln > 0) { e.seed = e.seed * 1664525u + 1013904223u; nz += ((int32_t) e.seed / 2147483648.0 - nz) * nc; B += nz * ln * 1.5; }
        const double xin = route == 2 ? A : A + B;
        double y1;
        if (t1 == 0)
        {
            const double S = (1 - G) * (G3 * ld[0] + G2 * ld[1] + G * ld[2] + ld[3]);
            double uu = fastTanh ((xin * 0.6 - k1 * S) / (1 + k1 * G4)), v = (uu - ld[0]) * G;
            uu = v + ld[0]; ld[0] = uu + v; v = (uu - ld[1]) * G; uu = v + ld[1]; ld[1] = uu + v; v = (uu - ld[2]) * G; uu = v + ld[2]; ld[2] = uu + v; v = (uu - ld[3]) * G; uu = v + ld[3]; ld[3] = uu + v;
            y1 = uu * lg;
        }
        else y1 = svf (sv, xin, k1, a11, a12, a13, t1, bg1);
        const double s = st ? saturate (y1, st, sg, smk) : y1;
        double y;
        if (! t2) y = route == 2 ? s + B : s;
        else if (route == 0) { const double y2 = svf (sv + 2, s + (xin - s) * bp, k2, a21, a22, a23, t2, bg2); y = y2 + (s - y2) * bn; }
        else if (route == 1) { const double y2 = svf (sv + 2, xin, k2, a21, a22, a23, t2, bg2); y = s * (1 - bm) + y2 * bm; }
        else { const double y2 = svf (sv + 2, B, k2, a21, a22, a23, t2, bg2); y = s * ga + y2 * gb; }
        y = fastTanh (y * 0.5) * 2 * a;
        L[off + i] += (float) (y * gl); R[off + i] += (float) (y * gr);
    }
    if (aE.s == 0) on = false;
}

} // namespace strain
