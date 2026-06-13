"use client";
import React, { useState } from "react";
import type { ElderProfileTemplate } from "../lib/templates/elder-profile-template";

type FormStep = "basic" | "health" | "lifestyle" | "communication" | "relationship" | "review";
const STEPS: { key: FormStep; label: string }[] = [
  { key: "basic", label: "Basic Info" }, { key: "health", label: "Health" },
  { key: "lifestyle", label: "Lifestyle" }, { key: "communication", label: "Communication" },
  { key: "relationship", label: "Relationship" }, { key: "review", label: "Review" },
];

export default function ElderProfileForm() {
  const [currentStep, setCurrentStep] = useState<FormStep>("basic");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<Partial<ElderProfileTemplate>>({
    basicInfo: { displayName: "", realName: "", relation: "", relationLabel: "", nicknames: [], phone: "" },
    healthProfile: { chronicDiseases: [], surgicalHistory: [], currentMedications: [], healthConcerns: [], healthAttitudes: [] },
    lifestyleProfile: { livingSituation: "", socialActivity: "moderate", exerciseHabit: "occasional" },
    communicationProfile: { preferredTime: { start: "08:00", end: "21:00" }, preferredChannels: ["phone"], topicsEnjoy: [], topicsAvoid: [], communicationStyle: [] },
    relationshipNotes: { sensitiveTopics: [], sharedMemories: [], tonePreference: [], contactStylePreference: "" },
  });
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const goNext = () => { if (stepIndex < STEPS.length - 1) setCurrentStep(STEPS[stepIndex + 1].key); };
  const goPrev = () => { if (stepIndex > 0) setCurrentStep(STEPS[stepIndex - 1].key); };
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/elder-profiles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: form, familyId: "family_001", caregiverId: "user_001" }),
      });
      const data = await res.json();
      if (data.success) setSubmitted(true);
    } catch (e) { console.error("submit failed", e); }
    finally { setSubmitting(false); }
  };
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-5xl mb-4">&#x2705;</div>
        <h2 className="text-xl font-bold text-green-700">Profile Created!</h2>
        <p className="text-gray-500 mt-2">Care profile for {form.basicInfo?.displayName} is ready</p>
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((step, idx) => (
          <React.Fragment key={step.key}>
            <div className={`flex flex-col items-center cursor-pointer ${idx <= stepIndex ? "text-blue-600" : "text-gray-400"}`} onClick={() => setCurrentStep(step.key)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx < stepIndex ? "bg-blue-600 text-white" : idx === stepIndex ? "bg-blue-100 text-blue-600 border-2 border-blue-600" : "bg-gray-100 text-gray-400"}`}>
                {idx < stepIndex ? "\u2713" : idx + 1}
              </div>
              <span className="text-xs mt-1">{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${idx < stepIndex ? "bg-blue-600" : "bg-gray-200"}`} />}
          </React.Fragment>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[320px]">
        {currentStep === "basic" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Basic Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="block"><span className="text-sm text-gray-600">Display Name *</span>
                <input className="mt-1 block w-full rounded-md border px-3 py-2" placeholder="e.g. Mom" value={form.basicInfo?.displayName || ""} onChange={(e) => setForm({ ...form, basicInfo: { ...form.basicInfo!, displayName: e.target.value } })} /></label>
              <label className="block"><span className="text-sm text-gray-600">Real Name</span>
                <input className="mt-1 block w-full rounded-md border px-3 py-2" value={form.basicInfo?.realName || ""} onChange={(e) => setForm({ ...form, basicInfo: { ...form.basicInfo!, realName: e.target.value } })} /></label>
              <label className="block"><span className="text-sm text-gray-600">Phone</span>
                <input className="mt-1 block w-full rounded-md border px-3 py-2" value={form.basicInfo?.phone || ""} onChange={(e) => setForm({ ...form, basicInfo: { ...form.basicInfo!, phone: e.target.value } })} /></label>
              <label className="block"><span className="text-sm text-gray-600">Birth Date</span>
                <input type="date" className="mt-1 block w-full rounded-md border px-3 py-2" value={form.basicInfo?.birthDate || ""} onChange={(e) => setForm({ ...form, basicInfo: { ...form.basicInfo!, birthDate: e.target.value } })} /></label>
            </div>
          </div>
        )}
        {currentStep === "health" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Health Profile</h3>
            <p className="text-sm text-gray-500">Describe health conditions and management attitudes.</p>
            <textarea className="w-full h-32 rounded-md border px-3 py-2 text-sm" placeholder="Health conditions, medications, attitudes..." />
          </div>
        )}
        {currentStep === "lifestyle" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Lifestyle</h3>
            <label className="block"><span className="text-sm text-gray-600">Living Situation</span>
              <input className="mt-1 block w-full rounded-md border px-3 py-2" value={form.lifestyleProfile?.livingSituation || ""} onChange={(e) => setForm({ ...form, lifestyleProfile: { ...form.lifestyleProfile!, livingSituation: e.target.value } })} /></label>
            <label className="block"><span className="text-sm text-gray-600">Social Activity</span>
              <select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.lifestyleProfile?.socialActivity || "moderate"} onChange={(e) => setForm({ ...form, lifestyleProfile: { ...form.lifestyleProfile!, socialActivity: e.target.value as any } })}>
                <option value="very_active">Very Active</option><option value="moderate">Moderate</option>
                <option value="low">Low</option><option value="very_low">Very Low</option><option value="isolated">Isolated</option>
              </select></label>
          </div>
        )}
        {currentStep === "communication" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Communication Preferences</h3>
            <textarea className="w-full h-24 rounded-md border px-3 py-2 text-sm" placeholder="Topics they enjoy..." />
            <textarea className="w-full h-24 rounded-md border px-3 py-2 text-sm" placeholder="Topics to avoid..." />
          </div>
        )}
        {currentStep === "relationship" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Relationship Notes</h3>
            <textarea className="w-full h-24 rounded-md border px-3 py-2 text-sm" placeholder="Sensitive topics..." />
            <textarea className="w-full h-24 rounded-md border px-3 py-2 text-sm" placeholder="Shared memories..." />
          </div>
        )}
        {currentStep === "review" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Review</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <p><strong>Name:</strong> {form.basicInfo?.displayName}</p>
              <p><strong>Real Name:</strong> {form.basicInfo?.realName || "N/A"}</p>
              <p><strong>Phone:</strong> {form.basicInfo?.phone || "N/A"}</p>
              <p><strong>Living:</strong> {form.lifestyleProfile?.livingSituation || "N/A"}</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between mt-6">
        <button onClick={goPrev} disabled={stepIndex === 0} className="px-4 py-2 rounded-lg border text-gray-600 disabled:opacity-30 hover:bg-gray-50">Prev</button>
        {currentStep === "review" ? (
          <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50">{submitting ? "Submitting..." : "Create Profile"}</button>
        ) : (
          <button onClick={goNext} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Next</button>
        )}
      </div>
    </div>
  );
}