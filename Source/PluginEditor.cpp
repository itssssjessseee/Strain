#include "PluginEditor.h"
#include "BinaryData.h"

using namespace strain;

static juce::WebBrowserComponent::Options makeOptions()
{
    return juce::WebBrowserComponent::Options()
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2()
                                     .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("StrainWebView")))
        .withNativeIntegrationEnabled();
}

StrainEditor::StrainEditor (StrainProcessor& p)
    : AudioProcessorEditor (p), proc (p),
      web (makeOptions()
               .withResourceProvider ([this] (const juce::String& path) { return getResource (path); })
               .withEventListener ("strain", [this] (juce::var m) { handleMessage (m); }))
{
    for (int i = 0; i < P_COUNT; ++i) shadow[(size_t) i] = proc.getParam (i);

    addAndMakeVisible (web);
    setResizable (true, true);
    setResizeLimits (380, 560, 1600, 1200);
    setSize (1000, 760);

    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    startTimerHz (30);
}

StrainEditor::~StrainEditor()
{
    stopTimer();
    StrainProcessor::UiMsg m; m.type = StrainProcessor::UiMsg::panic;   // release anything held on the on-screen keys
    proc.pushUiMsg (m);
}

void StrainEditor::resized() { web.setBounds (getLocalBounds()); }

std::optional<juce::WebBrowserComponent::Resource> StrainEditor::getResource (const juce::String& path)
{
    if (path == "/" || path == "/index.html")
    {
        juce::WebBrowserComponent::Resource r;
        const auto* bytes = reinterpret_cast<const std::byte*> (BinaryData::index_html);
        r.data.assign (bytes, bytes + BinaryData::index_htmlSize);
        r.mimeType = "text/html";
        return r;
    }
    return std::nullopt;
}

int StrainEditor::indexOfParam (const juce::String& id)
{
    for (int i = 0; i < P_COUNT; ++i)
        if (id == PARAMS[i].id) return i;
    return -1;
}

void StrainEditor::emit (juce::DynamicObject::Ptr obj)
{
    web.emitEventIfBrowserIsVisible ("strain", juce::var (obj.get()));
}

void StrainEditor::sendState()
{
    juce::DynamicObject::Ptr values = new juce::DynamicObject();
    for (int i = 0; i < P_COUNT; ++i)
    {
        shadow[(size_t) i] = proc.getParam (i);
        values->setProperty (PARAMS[i].id, shadow[(size_t) i]);
    }
    juce::DynamicObject::Ptr msg = new juce::DynamicObject();
    msg->setProperty ("t", "state");
    msg->setProperty ("p", juce::var (values.get()));
    msg->setProperty ("n", proc.getPatchName());
    emit (msg);
}

void StrainEditor::handleMessage (const juce::var& m)
{
    const auto type = m["t"].toString();
    using Msg = StrainProcessor::UiMsg;

    auto setOne = [this] (const juce::String& id, const juce::var& v)
    {
        const int i = indexOfParam (id);
        if (i < 0) return;
        proc.setParamFromUi (i, (float) (double) v);
        shadow[(size_t) i] = proc.getParam (i);   // don't echo the panel's own change back to it
    };

    if (type == "hello")      { pageReady = true; sendState(); }
    else if (type == "p")     setOne (m["k"].toString(), m["v"]);
    else if (type == "patch")
    {
        if (auto* obj = m["p"].getDynamicObject())
            for (const auto& prop : obj->getProperties())
                setOne (prop.name.toString(), prop.value);
    }
    else if (type == "name")  proc.setPatchName (m["n"].toString());
    else if (type == "on")    { Msg x; x.type = Msg::noteOn;  x.note = (int) m["n"]; x.value = (float) (double) m["v"]; proc.pushUiMsg (x); }
    else if (type == "off")   { Msg x; x.type = Msg::noteOff; x.note = (int) m["n"]; proc.pushUiMsg (x); }
    else if (type == "slide") { Msg x; x.type = Msg::slide;   x.note = (int) m["n"]; x.value = (float) (double) m["v"]; proc.pushUiMsg (x); }
    else if (type == "panic") { Msg x; x.type = Msg::panic; proc.pushUiMsg (x); }
    else if (type == "prog")
    {
        Msg x; x.type = (bool) m["on"] ? Msg::progStart : Msg::progStop;
        x.beats = (float) (double) m["len"];
        if (const auto* chords = m["ch"].getArray())
            for (const auto& chord : *chords)
            {
                if (x.numChords >= 8) break;
                if (const auto* notes = chord.getArray())
                {
                    int c = 0;
                    for (const auto& note : *notes) if (c < 8) x.chords[x.numChords][c++] = (int8_t) juce::jlimit (0, 127, (int) note);
                    x.counts[x.numChords++] = (int8_t) c;
                }
            }
        if (x.type == Msg::progStart && x.numChords == 0) x.type = Msg::progStop;
        proc.pushUiMsg (x);
    }
}

void StrainEditor::timerCallback()
{
    if (! pageReady) return;

    // host automation and state recalls -> panel
    for (int i = 0; i < P_COUNT; ++i)
    {
        const float v = proc.getParam (i);
        if (v != shadow[(size_t) i])
        {
            shadow[(size_t) i] = v;
            juce::DynamicObject::Ptr msg = new juce::DynamicObject();
            msg->setProperty ("t", "pv"); msg->setProperty ("k", PARAMS[i].id); msg->setProperty ("v", v);
            emit (msg);
        }
    }

    const int chord = proc.getChordIndex();
    if (chord != lastChord)
    {
        lastChord = chord;
        juce::DynamicObject::Ptr msg = new juce::DynamicObject();
        msg->setProperty ("t", "chord"); msg->setProperty ("i", chord);
        emit (msg);
    }

    const bool live = proc.readScope (scopeData);
    if (live || scopeWasLive)
    {
        juce::DynamicObject::Ptr msg = new juce::DynamicObject();
        msg->setProperty ("t", "scope"); msg->setProperty ("d", juce::var (scopeData));
        emit (msg);
    }
    scopeWasLive = live;
}
