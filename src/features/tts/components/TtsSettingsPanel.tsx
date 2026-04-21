"use client";

import { useEffect, useState } from "react";
import {
  createTtsProfile,
  fetchTtsSettings,
  updateDefaultTtsProfile
} from "@/features/tts/infrastructure/ttsApi";
import type { TtsProfile } from "@/features/tts/types/TtsProfile";

type NewProfileState = {
  name: string;
  voiceName: string;
  speakingRate: string;
  styleName: string;
  sentencePauseLevel: "short" | "medium" | "long";
  previewSampleText: string;
};

const INITIAL_NEW_PROFILE: NewProfileState = {
  name: "",
  voiceName: "en-US-Neural2-F",
  speakingRate: "0.9",
  styleName: "calm",
  sentencePauseLevel: "medium",
  previewSampleText: "Hello, I am ready to read with you."
};

export function TtsSettingsPanel() {
  const [profiles, setProfiles] = useState<TtsProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [newProfile, setNewProfile] = useState<NewProfileState>(INITIAL_NEW_PROFILE);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const settings = await fetchTtsSettings();
        if (!mounted) {
          return;
        }

        setProfiles(settings.profiles);
        setDefaultProfileId(settings.defaultProfileId);
      } catch (error) {
        if (mounted) {
          setStatusMessage(error instanceof Error ? error.message : "TTS 설정을 불러오지 못했습니다.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveDefault = async () => {
    if (!defaultProfileId) {
      return;
    }

    setSaving(true);
    setStatusMessage(undefined);
    try {
      const settings = await updateDefaultTtsProfile(defaultProfileId);
      setProfiles(settings.profiles);
      setDefaultProfileId(settings.defaultProfileId);
      setStatusMessage("기본 TTS 프리셋을 저장했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "기본 프리셋 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage(undefined);
    try {
      await createTtsProfile({
        name: newProfile.name.trim(),
        voiceName: newProfile.voiceName.trim(),
        speakingRate: Number(newProfile.speakingRate),
        styleName: newProfile.styleName.trim() || undefined,
        sentencePauseLevel: newProfile.sentencePauseLevel,
        previewSampleText: newProfile.previewSampleText.trim() || undefined,
        isDefault: profiles.length === 0
      });

      const settings = await fetchTtsSettings();
      setProfiles(settings.profiles);
      setDefaultProfileId(settings.defaultProfileId);
      setNewProfile(INITIAL_NEW_PROFILE);
      setStatusMessage("새 TTS 프리셋을 추가했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "프리셋 추가에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h1>TTS 기본 설정 (Phase 3)</h1>
        <p className="muted">부모 공통 프리셋을 선택하고, 새로운 TTS 프리셋을 추가할 수 있습니다.</p>
        {(loading || saving) && <p className="muted">작업 중...</p>}
        {statusMessage && <p>{statusMessage}</p>}
      </section>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <h2>기본 프리셋 선택</h2>
          {profiles.length === 0 && <p className="muted">등록된 프리셋이 없습니다.</p>}
          {profiles.map((profile) => (
            <label
              key={profile.id}
              style={{ display: "block", padding: "0.5rem 0", borderBottom: "1px solid #eef3fb" }}
            >
              <input
                type="radio"
                name="default-profile"
                checked={defaultProfileId === profile.id}
                onChange={() => setDefaultProfileId(profile.id)}
                style={{ marginRight: "0.5rem" }}
              />
              <strong>{profile.name}</strong>
              <span className="muted" style={{ marginLeft: "0.5rem" }}>
                {profile.voiceName} / rate {profile.speakingRate}
              </span>
            </label>
          ))}
          <button
            type="button"
            onClick={handleSaveDefault}
            disabled={!defaultProfileId || saving || loading}
            style={{ marginTop: "0.75rem" }}
          >
            기본 프리셋 저장
          </button>
        </article>

        <article className="panel">
          <h2>새 프리셋 추가</h2>
          <form onSubmit={handleCreateProfile}>
            <label htmlFor="tts-name">프리셋 이름</label>
            <input
              id="tts-name"
              value={newProfile.name}
              onChange={(event) => setNewProfile((current) => ({ ...current, name: event.target.value }))}
              required
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", padding: "0.6rem" }}
            />

            <label htmlFor="tts-voice">Voice</label>
            <input
              id="tts-voice"
              value={newProfile.voiceName}
              onChange={(event) => setNewProfile((current) => ({ ...current, voiceName: event.target.value }))}
              required
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", padding: "0.6rem" }}
            />

            <label htmlFor="tts-rate">속도 (0.6 ~ 1.4)</label>
            <input
              id="tts-rate"
              type="number"
              min={0.6}
              max={1.4}
              step={0.01}
              value={newProfile.speakingRate}
              onChange={(event) => setNewProfile((current) => ({ ...current, speakingRate: event.target.value }))}
              required
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", padding: "0.6rem" }}
            />

            <label htmlFor="tts-style">스타일</label>
            <input
              id="tts-style"
              value={newProfile.styleName}
              onChange={(event) => setNewProfile((current) => ({ ...current, styleName: event.target.value }))}
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", padding: "0.6rem" }}
            />

            <label htmlFor="tts-pause">문장 간격</label>
            <select
              id="tts-pause"
              value={newProfile.sentencePauseLevel}
              onChange={(event) =>
                setNewProfile((current) => ({
                  ...current,
                  sentencePauseLevel: event.target.value as NewProfileState["sentencePauseLevel"]
                }))
              }
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", padding: "0.6rem" }}
            >
              <option value="short">short</option>
              <option value="medium">medium</option>
              <option value="long">long</option>
            </select>

            <label htmlFor="tts-preview">샘플 문장</label>
            <textarea
              id="tts-preview"
              value={newProfile.previewSampleText}
              onChange={(event) =>
                setNewProfile((current) => ({ ...current, previewSampleText: event.target.value }))
              }
              style={{ display: "block", width: "100%", margin: "0.5rem 0 0.75rem", minHeight: "90px", padding: "0.6rem" }}
            />

            <button type="submit" disabled={saving || loading}>
              프리셋 추가
            </button>
          </form>
        </article>
      </section>
    </>
  );
}

