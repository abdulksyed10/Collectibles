import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CollectionRepository } from '../domain/models';
import { colors, ui } from './ui';
import { PolicyLinks } from './PolicyLinks';

export function useContributionPolicy(repository: CollectionRepository) {
  const [accepted, setAccepted] = useState(false);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    let active = true;
    void repository.getPolicyAcceptance().then(value => { if (active) setAccepted(value.acceptedVersion === value.requiredVersion); }).catch(() => { /* Saving retries the server boundary. */ });
    return () => { active = false; };
  }, [repository]);
  return {
    element: accepted ? null : <View style={{ gap: 8 }}><PolicyLinks /><Pressable accessibilityRole="checkbox" accessibilityLabel="Agree to Terms and Community rules" accessibilityState={{ checked: agreed }} onPress={() => setAgreed(value => !value)} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, minHeight: 48 }}><Text style={ui.text}>{agreed ? '☑' : '☐'} I agree to the Terms of use and Community rules.</Text></Pressable></View>,
    async ensure() {
      if (accepted) return;
      if (!agreed) throw new Error('Read and agree to the Terms and Community rules before saving.');
      await repository.acceptPublicRules();
      setAccepted(true);
    },
  };
}
