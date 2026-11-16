// Headless check of the plugin glue: parameters, MIDI, editor messages, state save and recall.
#include "../Source/PluginProcessor.h"
#include <cstdio>
using namespace strain;

static double render (StrainProcessor& p, juce::MidiBuffer& midi, int blocks, int n = 480)
{
    juce::AudioBuffer<float> buf (2, n); double sq = 0; long cnt = 0;
    for (int b = 0; b < blocks; ++b)
    {
        p.processBlock (buf, midi); midi.clear();
        for (int c = 0; c < 2; ++c) for (int i = 0; i < n; ++i) { const float v = buf.getSample (c, i); if (! std::isfinite (v)) { std::puts ("NaN!"); std::exit (1); } sq += v * v; ++cnt; }
    }
    return std::sqrt (sq / (double) cnt);
}

int main()
{
    juce::ScopedJuceInitialiser_GUI init;
    int fails = 0; auto check = [&] (bool ok, const char* what) { std::printf ("%s  %s\n", ok ? "ok  " : "FAIL", what); if (! ok) ++fails; };

    StrainProcessor p; p.setRateAndBufferSizeDetails (48000, 480); p.prepareToPlay (48000, 480);
    check (p.getParameters().size() == P_COUNT, "all parameters registered");
    check (p.getPatchName() == "Solar Hyper", "opens on first factory patch");
    check (p.getParam (P_o1mode) == 1.0f, "factory patch values applied");

    juce::MidiBuffer midi;
    check (render (p, midi, 20) < 1e-6, "silent with no notes");
    midi.addEvent (juce::MidiMessage::noteOn (1, 60, 0.8f), 13); midi.addEvent (juce::MidiMessage::noteOn (1, 67, 0.8f), 200);
    check (render (p, midi, 50) > 0.02, "MIDI notes produce sound");
    midi.addEvent (juce::MidiMessage::noteOff (1, 60), 0); midi.addEvent (juce::MidiMessage::noteOff (1, 67), 0);
    render (p, midi, 1500);
    check (render (p, midi, 20) < 1e-4, "releases to silence");

    StrainProcessor::UiMsg on; on.type = StrainProcessor::UiMsg::noteOn; on.note = 48; on.value = 0.9f; p.pushUiMsg (on);
    check (render (p, midi, 50) > 0.02, "on-screen key message produces sound");
    StrainProcessor::UiMsg pc; pc.type = StrainProcessor::UiMsg::panic; p.pushUiMsg (pc);

    p.setParamFromUi (P_f1cut, 0.33f); p.setParamFromUi (P_arpMode, 3.0f); p.setParamFromUi (P_o2semi, 7.0f); p.setParamFromUi (P_sync, 1.0f); p.setPatchName ("My Patch");
    juce::MemoryBlock state; p.getStateInformation (state);
    StrainProcessor q; q.prepareToPlay (48000, 480); q.setStateInformation (state.getData(), (int) state.getSize());
    check (std::abs (q.getParam (P_f1cut) - 0.33f) < 1e-5f && q.getParam (P_arpMode) == 3.0f && q.getParam (P_o2semi) == 7.0f && q.getParam (P_sync) == 1.0f, "state recall restores parameters");
    check (q.getPatchName() == "My Patch", "state recall restores patch name");

    StrainProcessor::UiMsg pr; pr.type = StrainProcessor::UiMsg::progStart; pr.numChords = 2; pr.beats = 1;
    const int8_t a[4] = { 45, 57, 60, 64 }, b[4] = { 41, 57, 60, 65 };
    for (int i = 0; i < 4; ++i) { pr.chords[0][i] = a[i]; pr.chords[1][i] = b[i]; } pr.counts[0] = pr.counts[1] = 4;
    q.pushUiMsg (pr); const double r = render (q, midi, 200);
    check (r > 0.02 && q.getChordIndex() >= 0, "chord progression plays and reports its position");
    juce::Array<juce::var> sc; check (q.readScope (sc) && sc.size() == 1024, "scope data available");

    std::printf (fails ? "%d check(s) failed\n" : "all checks passed\n", fails);
    return fails;
}
