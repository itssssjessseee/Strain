#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

// The editor is a web view showing ui/index.html (embedded in the binary).
// The page and the plugin exchange small JSON messages on the "strain" event.
class StrainEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit StrainEditor (StrainProcessor&);
    ~StrainEditor() override;

    void resized() override;
    void paint (juce::Graphics& g) override { g.fillAll (juce::Colour (0xff110c0d)); }

private:
    void timerCallback() override;
    void handleMessage (const juce::var& m);
    void sendState();
    void emit (juce::DynamicObject::Ptr obj);
    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& path);
    static int indexOfParam (const juce::String& id);

    StrainProcessor& proc;
    std::array<float, strain::P_COUNT> shadow {};
    juce::Array<juce::var> scopeData;
    int lastChord = -2;
    bool pageReady = false, scopeWasLive = false;
    juce::WebBrowserComponent web;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StrainEditor)
};
