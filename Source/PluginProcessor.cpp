#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "Presets.h"

using namespace strain;

juce::AudioProcessorValueTreeState::ParameterLayout StrainProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    for (int i = 0; i < P_COUNT; ++i)
    {
        const auto& d = PARAMS[i];
        const juce::ParameterID pid { d.id, 1 };

        if (d.type == 1)
            layout.add (std::make_unique<juce::AudioParameterChoice> (pid, d.name, juce::StringArray::fromTokens (d.choices, "|", ""), (int) d.def));
        else if (d.type == 2)
            layout.add (std::make_unique<juce::AudioParameterBool> (pid, d.name, d.def > 0.5f));
        else
            layout.add (std::make_unique<juce::AudioParameterFloat> (pid, d.name, juce::NormalisableRange<float> (d.min, d.max, d.step), d.def));
    }

    return layout;
}

StrainProcessor::StrainProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "STRAIN", createLayout())
{
    for (int i = 0; i < P_COUNT; ++i)
    {
        raw[(size_t) i] = apvts.getRawParameterValue (PARAMS[i].id);
        params[(size_t) i] = apvts.getParameter (PARAMS[i].id);
        jassert (raw[(size_t) i] != nullptr && params[(size_t) i] != nullptr);
    }

    // A new instance opens on the first factory patch, the same one the panel shows.
    const auto& first = PRESETS[0];
    for (int k = 0; k < first.count; ++k)
    {
        auto* p = params[(size_t) first.values[k].id];
        p->setValueNotifyingHost (p->convertTo0to1 (first.values[k].v));
    }
    setPatchName (first.name);
}

void StrainProcessor::setParamFromUi (int index, float value)
{
    if (index < 0 || index >= P_COUNT) return;
    auto* p = params[(size_t) index];
    const auto norm = p->convertTo0to1 (juce::jlimit (PARAMS[index].min, PARAMS[index].max, value));
    if (std::abs (norm - p->getValue()) < 1.0e-7f) return;
    p->beginChangeGesture();
    p->setValueNotifyingHost (norm);
    p->endChangeGesture();
}

void StrainProcessor::pushUiMsg (const UiMsg& m)
{
    const auto scope1 = fifo.write (1);
    if (scope1.blockSize1 > 0) msgs[(size_t) scope1.startIndex1] = m;
    else if (scope1.blockSize2 > 0) msgs[(size_t) scope1.startIndex2] = m;
}

bool StrainProcessor::readScope (juce::Array<juce::var>& dest)
{
    const int end = scopePos.load (std::memory_order_relaxed);
    float peak = 0;
    dest.clearQuick();
    dest.ensureStorageAllocated (scopeSize);
    for (int i = 0; i < scopeSize; ++i)
    {
        const float v = scope[(size_t) ((end + i) % scopeSize)].load (std::memory_order_relaxed);
        peak = juce::jmax (peak, std::abs (v));
        dest.add (juce::roundToInt (v * 1000.0f));
    }
    return peak > 1.0e-4f;
}

void StrainProcessor::prepareToPlay (double sampleRate, int)
{
    engine.prepare (sampleRate);
}

bool StrainProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void StrainProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    if (buffer.getNumChannels() < 2 || n == 0) { buffer.clear(); return; }
    float* L = buffer.getWritePointer (0);
    float* R = buffer.getWritePointer (1);

    for (int i = 0; i < P_COUNT; ++i)
        engine.setParam (i, (double) raw[(size_t) i]->load (std::memory_order_relaxed));

    engine.hostBpm = 0;
    if (auto* ph = getPlayHead())
        if (const auto pos = ph->getPosition())
            if (const auto bpm = pos->getBpm())
                engine.hostBpm = *bpm;

    {
        const auto rd = fifo.read (fifo.getNumReady());
        auto handle = [this] (const UiMsg& m)
        {
            switch (m.type)
            {
                case UiMsg::noteOn:    engine.keyDown (m.note, m.value); break;
                case UiMsg::noteOff:   engine.keyUp (m.note); break;
                case UiMsg::slide:     engine.setSlide (m.note, m.value); break;
                case UiMsg::panic:     engine.stopProgression(); engine.panic(); break;
                case UiMsg::progStart: engine.setProgression (m.chords, m.counts, m.numChords, m.beats); break;
                case UiMsg::progStop:  engine.stopProgression(); break;
                default: break;
            }
        };
        for (int i = 0; i < rd.blockSize1; ++i) handle (msgs[(size_t) (rd.startIndex1 + i)]);
        for (int i = 0; i < rd.blockSize2; ++i) handle (msgs[(size_t) (rd.startIndex2 + i)]);
    }

    int pos = 0;
    for (const auto meta : midi)
    {
        const int t = juce::jlimit (0, n, meta.samplePosition);
        if (t > pos) { engine.process (L + pos, R + pos, t - pos); pos = t; }

        const auto msg = meta.getMessage();
        if (msg.isNoteOn())                               engine.keyDown (msg.getNoteNumber(), msg.getFloatVelocity());
        else if (msg.isNoteOff())                         engine.keyUp (msg.getNoteNumber());
        else if (msg.isPitchWheel())                      engine.bend = (msg.getPitchWheelValue() - 8192) / 8192.0;
        else if (msg.isControllerOfType (1))              engine.mw = msg.getControllerValue() / 127.0;
        else if (msg.isAftertouch())                      engine.setSlide (msg.getNoteNumber(), msg.getAfterTouchValue() / 127.0);
        else if (msg.isChannelPressure())                 engine.setSlideAll (msg.getChannelPressureValue() / 127.0);
        else if (msg.isAllNotesOff() || msg.isAllSoundOff()) engine.panic();
    }
    if (pos < n) engine.process (L + pos, R + pos, n - pos);
    midi.clear();

    for (int ch = 2; ch < buffer.getNumChannels(); ++ch) buffer.clear (ch, 0, n);

    int sp = scopePos.load (std::memory_order_relaxed);
    for (int i = 0; i < n; ++i)
    {
        scope[(size_t) sp].store ((L[i] + R[i]) * 0.5f, std::memory_order_relaxed);
        sp = (sp + 1) % scopeSize;
    }
    scopePos.store (sp, std::memory_order_relaxed);
}

void StrainProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (const auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void StrainProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (const auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* StrainProcessor::createEditor() { return new StrainEditor (*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new StrainProcessor(); }
