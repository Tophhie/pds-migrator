import React, { useState } from "react";
import { SimpleMigrator } from "./SimpleMigrator";

export default function MigrationUI() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    oldHandle: "",
    password: "",
    email: "",
    handle: "",
    plcToken: "",
    twoFactorCode: "", // NEW
  });
  const [status, setStatus] = useState("");
  const [migrator, setMigrator] = useState(null);
  const [progressStage, setProgressStage] = useState(0);
  const [needs2FA, setNeeds2FA] = useState(false); // NEW

  const stages = [
    "Login",
    "Create account",
    "Migrate repo",
    "Migrate blobs",
    "Migrate preferences",
    "PLC update",
  ];

  const updateField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  function statusHandler(msg) {
    setStatus(msg);
    const lower = msg.toLowerCase();
    if (lower.includes("login")) setProgressStage(1);
    else if (lower.includes("account")) setProgressStage(2);
    else if (lower.includes("repo")) setProgressStage(3);
    else if (lower.includes("blob")) setProgressStage(4);
    else if (lower.includes("pref")) setProgressStage(5);
    else if (lower.includes("plc")) setProgressStage(6);
  }

  async function runMigrate(with2FA = false) {
    const m = migrator ?? new SimpleMigrator("https://tophhie.social");
    if (!migrator) setMigrator(m);

    await m.migrate({
      oldHandle: form.oldHandle,
      password: form.password,
      email: form.email,
      handle: form.handle,
      statusUpdateHandler: statusHandler,
      twoFactorCode: with2FA ? form.twoFactorCode : null, // pass only when we have it
    });
  }

  async function startMigration() {
    try {
      setStatus("Starting migration...");
      setProgressStage(0);
      setNeeds2FA(false);
      await runMigrate(false);
      setStatus("Check your email for a PLC token.");
      setStep(2);
    } catch (err) {
      // Some PDSes return a structured error with .error, others only message
      const code = err?.error || "";
      if (
        code === "AuthFactorTokenRequired" ||
        /auth.*factor.*required/i.test(err?.message || "")
      ) {
        setNeeds2FA(true);
        setStatus(
          "Two-factor required. Check your email for the code, enter it below, then continue."
        );
        return;
      }
      setStatus(`❌ ${err.message || "Migration failed"}`);
    }
  }

  async function continueWith2FA(e) {
    if (e) e.preventDefault();
    try {
      if (!form.twoFactorCode.trim()) {
        setStatus("Please enter your 2FA code.");
        return;
      }
      setStatus("Verifying 2FA and continuing migration…");
      await runMigrate(true);
      setStatus("Check your email for a PLC token.");
      setStep(2);
    } catch (err) {
      setStatus(`❌ ${err.message || "2FA verification failed"}`);
    }
  }

  async function finishMigration() {
    try {
      setStatus("Finalizing migration with PLC token...");
      await migrator.signPlcOperation(form.plcToken, statusHandler);
      setStep(3);
      setProgressStage(stages.length);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-brand flex items-center justify-center p-6">
      <div className="bg-white shadow-xl rounded-2xl max-w-lg w-full p-10 space-y-6">
        <img
          src="https://blob.tophhie.cloud/tophhiecloud-resources/Logos/tophhiecloud-colour-padded.png"
          className="mx-auto w-auto"
          style={{ maxWidth: "40%", height: "auto" }}
          alt="Tophhie Cloud"
        />
        <h1 className="text-2xl font-bold text-gray-900">Migrate to Tophhie Social</h1>
        <p className="text-gray-600">Move your Bluesky account in a few easy steps.</p>

        {/* Progress bar with steps */}
        <div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(progressStage / stages.length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {stages.map((stage, i) => (
              <div
                key={i}
                className={`flex-1 text-xs ${
                  i < progressStage
                    ? "text-green-600 font-medium"
                    : i === progressStage
                    ? "text-blue-600 font-medium"
                    : "text-gray-500"
                } text-center`}
              >
                {i + 1}. {stage}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: credentials (and 2FA when needed) */}
        {step === 1 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              needs2FA ? continueWith2FA(e) : startMigration();
            }}
          >
            <input
              type="text"
              placeholder="Old handle (e.g. alice.bsky.social)"
              value={form.oldHandle}
              onChange={(e) => updateField("oldHandle", e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
            />

            {/* Optional 2FA input; shows automatically when required */}
            {(needs2FA || form.twoFactorCode) && (
              <input
                type="text"
                inputMode="numeric"
                placeholder="2FA code (from email)"
                value={form.twoFactorCode}
                onChange={(e) => updateField("twoFactorCode", e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
              />
            )}

            <input
              type="email"
              placeholder="Email for new PDS"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
            />
            <input
              type="text"
              placeholder="New handle (e.g. me.tophhie.social)"
              value={form.handle}
              onChange={(e) => updateField("handle", e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
            />

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition"
            >
              {needs2FA ? "Continue with 2FA" : "Start Migration"}
            </button>
          </form>
        )}

        {/* Step 2: PLC token */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-gray-700">Enter the PLC token you received via email:</p>
            <input
              type="text"
              placeholder="PLC token"
              value={form.plcToken}
              onChange={(e) => updateField("plcToken", e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
            />
            <button
              onClick={finishMigration}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition"
            >
              Finalize Migration
            </button>
          </div>
        )}

        {/* Step 3: done */}
        {step === 3 && (
          <div className="space-y-2 text-center">
            <p className="text-green-700 font-semibold text-lg">🎉 Migration complete!</p>
            <p className="text-gray-700">
              You can now log in using the PDS URL <span className="font-mono">tophhie.social</span>.
            </p>
          </div>
        )}

        {status && <p className="text-sm text-gray-700 whitespace-pre-line">{status}</p>}
      </div>
    </div>
  );
}