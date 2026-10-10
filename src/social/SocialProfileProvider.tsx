import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ProfileSettings } from './ProfileSettings';
import { invalidateSocial } from './events';
import { profileSetupState } from './profileFlow';
import type { OwnSocialProfile, SocialCapabilities } from './types';
import { disabledSocialCapabilities } from './repository';
import { useRepository } from '../data/RepositoryProvider';

type SocialProfileContextValue = {
  capabilities: SocialCapabilities;
  profile: OwnSocialProfile | null;
  loading: boolean;
  error: string;
  completeProfileIntro: (username: string) => Promise<OwnSocialProfile>;
  updateUsername: (username: string) => Promise<OwnSocialProfile>;
  retry: () => void;
};

const SocialProfileContext = createContext<SocialProfileContextValue | null>(null);

export function useSocialProfile() {
  const value = useContext(SocialProfileContext);
  if (!value) throw new Error('A social profile provider is required.');
  return value;
}

export function SocialProfileProvider({ children, guest = false }: { children: ReactNode; guest?: boolean }) {
  const repository = useRepository();
  const [capabilities, setCapabilities] = useState<SocialCapabilities>(disabledSocialCapabilities);
  const [profile, setProfile] = useState<OwnSocialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setProfile(null);
    void (async () => {
      try {
        const nextCapabilities = await repository.getSocialCapabilities();
        if (!current) return;
        setCapabilities(nextCapabilities);
        if (nextCapabilities.profilesEnabled && !guest) {
          const nextProfile = await repository.ensureSocialProfile();
          if (!current) return;
          setProfile(nextProfile);
        }
      } catch (reason) {
        if (current) setError(reason instanceof Error ? reason.message : 'Unable to load your profile. Try again.');
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [guest, repository, retryVersion]);

  useEffect(() => () => { invalidateSocial('session'); }, []);

  async function completeProfileIntro(username: string) {
    const next = await repository.completeProfileIntro(username);
    setProfile(next);
    invalidateSocial('profile');
    return next;
  }
  async function updateUsername(username: string) {
    const next = await repository.updateUsername(username);
    setProfile(next);
    invalidateSocial('profile');
    return next;
  }

  const value: SocialProfileContextValue = { capabilities, profile, loading, error, completeProfileIntro, updateUsername, retry: () => setRetryVersion(value => value + 1) };
  const setup = profileSetupState(capabilities, profile);
  return <SocialProfileContext.Provider value={value}>{children}{setup === 'intro' && profile ? <ProfileSettings profile={profile} mode="intro" save={completeProfileIntro} onClose={() => undefined} onDone={() => undefined} /> : null}</SocialProfileContext.Provider>;
}
