#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "Engine.h"

class StrainProcessor : public juce::AudioProcessor
{
public:
    // A message from the editor (message thread) to the engine (audio thread).
    struct UiMsg
    {
        enum Type { noteOn, noteOff, slide, panic, progStart, progStop };
        int type = noteOn, note = 0;
        float value = 0;
        int8_t chords[8][8] = {}; int8_t counts[8] = {}; int numChords = 0; float beats = 4;
    };

    StrainProcessor();
    ~StrainProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Strain"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 8.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // message thread only
    void pushUiMsg (const UiMsg& m);
    void setParamFromUi (int index, float value);
    float getParam (int index) const { return raw[(size_t) index]->load(); }
    juce::String getPatchName() const { return apvts.state.getProperty ("patchName", "Solar Hyper").toString(); }
    void setPatchName (const juce::String& n) { apvts.state.setProperty ("patchName", n, nullptr); }
    int getChordIndex() const { return engine.chordIndex.load(); }
    // copies the most recent output (mono, x1000) for the scope display; returns false when silent
    bool readScope (juce::Array<juce::var>& dest);

    juce::AudioProcessorValueTreeState apvts;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    strain::Engine engine;
    std::array<std::atomic<float>*, strain::P_COUNT> raw {};
    std::array<juce::RangedAudioParameter*, strain::P_COUNT> params {};

    juce::AbstractFifo fifo { 256 };
    std::array<UiMsg, 256> msgs;

    static constexpr int scopeSize = 1024;
    std::array<std::atomic<float>, scopeSize> scope {};
    std::atomic<int> scopePos { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StrainProcessor)
};
