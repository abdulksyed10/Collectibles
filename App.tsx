import { AppAnalytics } from './src/components/AppAnalytics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { useSession } from './src/auth/session';
import { AuthScreen, RecoveryScreen } from './src/screens/AuthScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { colors } from './src/components/ui';
import { RepositoryProvider } from './src/data/RepositoryProvider';
import { repository } from './src/data/repository';
import { createDemoRepository } from './src/data/demo';
import type { CollectionRepository } from './src/domain/models';
import { sharedIdFromUrl } from './src/domain/sharing';
import { SharedCollectionScreen } from './src/screens/SharedCollectionScreen';
import { GuestExploreScreen } from './src/screens/GuestExploreScreen';
import { PublicTopicScreen } from './src/screens/PublicTopicScreen';
import { PublicInfoScreen, type PublicInfoPage } from './src/screens/PublicInfoScreen';
import { ThemeProvider, useTheme } from './src/theme/theme';
import { handleAuthCallback } from './src/auth/oauth';
import { publicInfoPageFromUrl } from './src/lib/publicPages';
import { SocialProfileProvider } from './src/social/SocialProfileProvider';
import { socialDestinationFromUrl, type SocialDestination } from './src/social/links';
import { CollectorProfileScreen } from './src/social/CollectorProfileScreen';
import { SharedEntryScreen } from './src/social/SharedEntryScreen';
import { clearPendingSocialDestination, consumePendingSocialDestination, setPendingSocialDestination } from './src/social/pendingDestination';
export default function App() { return <ThemeProvider><CollectiblesApp /></ThemeProvider>; }
function CollectiblesApp() {
  const { effectiveTheme } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, InstrumentSerif_400Regular });
  const { session, loading, recovery, finishRecovery } = useSession();
  const [demo, setDemo] = useState<CollectionRepository | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(() => Platform.OS === 'web' && typeof window !== 'undefined' ? sharedIdFromUrl(window.location.href) : null);
  const [socialDestination, setSocialDestination] = useState<SocialDestination | null>(() => Platform.OS === 'web' && typeof window !== 'undefined' ? socialDestinationFromUrl(window.location.href) : null);
  const [publicInfoPage, setPublicInfoPage] = useState<PublicInfoPage | null>(() => Platform.OS === 'web' && typeof window !== 'undefined' ? publicInfoPageFromUrl(window.location.href) : null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [guestExplore, setGuestExplore] = useState(false);
  const [previewTopic, setPreviewTopic] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState('');
  const sessionIdentity = session?.user.id ?? 'guest';
  const previousSessionIdentity = useRef<string | null>(session?.user.id ?? null);
  useEffect(() => {
    const previous = previousSessionIdentity.current;
    const current = session?.user.id ?? null;
    previousSessionIdentity.current = current;
    if (previous && previous !== current) clearPendingSocialDestination();
    if (!current) return;
    const pending = consumePendingSocialDestination();
    if (pending) setSocialDestination(pending);
  }, [session?.user.id]);
  useEffect(() => {
    let active = true;
    const processUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const callback = await handleAuthCallback(url);
        if (!active) return;
        if (callback === 'handled') {
          setCallbackError('');
          setSharedId(null); setSocialDestination(null); setPublicInfoPage(null); clearPendingSocialDestination();
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const clean = new URL(window.location.href);
            clean.pathname = '/'; clean.search = ''; clean.hash = '';
            window.history.replaceState({}, '', clean.toString());
          }
          return;
        }
      } catch (error) {
        if (!active) return;
        setSharedId(null); setSocialDestination(null); clearPendingSocialDestination();
        setCallbackError(error instanceof Error ? error.message : 'Social sign-in could not be completed. Please try again.');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const clean = new URL(window.location.href);
          clean.pathname = '/'; clean.search = ''; clean.hash = '';
          window.history.replaceState({}, '', clean.toString());
        }
        return;
      }
      if (active) {
        setPublicInfoPage(publicInfoPageFromUrl(url));
        setSharedId(sharedIdFromUrl(url));
        setSocialDestination(socialDestinationFromUrl(url));
      }
    };
    if (Platform.OS === 'web') {
      void processUrl(window.location.href);
      const changed = () => { void processUrl(window.location.href); };
      window.addEventListener('popstate', changed);
      return () => { active = false; window.removeEventListener('popstate', changed); };
    }
    void Linking.getInitialURL().then(processUrl);
    const listener = Linking.addEventListener('url', event => { void processUrl(event.url); });
    return () => { active = false; listener.remove(); };
  }, []);
  function leaveSharedView() {
    setSharedId(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href); url.searchParams.delete('collection');
      window.history.replaceState({}, '', url.toString());
    }
  }
  function leaveSocialDestination() {
    setSocialDestination(null);
    clearPendingSocialDestination();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href); url.searchParams.delete('collector'); url.searchParams.delete('item');
      window.history.replaceState({}, '', url.toString());
    }
  }
  function signInFromSocialDestination() {
    if (socialDestination) setPendingSocialDestination(socialDestination);
    setSocialDestination(null);
  }
  function leavePublicInfoPage() {
    setPublicInfoPage(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href); url.pathname = '/'; url.search = ''; url.hash = '';
      window.history.replaceState({}, '', url.toString());
    }
  }
  let content;
  if (publicInfoPage) {
    content = <PublicInfoScreen page={publicInfoPage} onBack={leavePublicInfoPage} />;
  } else if ((!fontsLoaded && !fontError) || (loading && !sharedId && !socialDestination)) {
    content = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /><Text style={{ marginTop: 14, color: colors.ink }}>Opening your collection…</Text></View>;
  } else if (recovery) {
    content = <RecoveryScreen onDone={finishRecovery} />;
  } else if (sharedId) {
    content = <SharedCollectionScreen collectionId={sharedId} repository={repository} onBack={leaveSharedView} />;
  } else if (socialDestination) {
    content = <RepositoryProvider key={`shared-repository-${sessionIdentity}`} value={repository}><SocialProfileProvider key={`shared-social-${sessionIdentity}`} guest={!session}>{socialDestination.type === 'collector' ? <CollectorProfileScreen publisherId={socialDestination.id} onClose={leaveSocialDestination} onSignIn={session ? undefined : signInFromSocialDestination} /> : <SharedEntryScreen itemId={socialDestination.id} onClose={leaveSocialDestination} onSignIn={session ? undefined : signInFromSocialDestination} />}</SocialProfileProvider></RepositoryProvider>;
  } else if (demo) {
    content = <RepositoryProvider value={demo}><SocialProfileProvider><LibraryScreen key="demo" email="Demo collector" onPreviewShared={setPreviewId} onPreviewTopic={setPreviewTopic} onExitDemo={() => { setPreviewId(null); setPreviewTopic(null); setDemo(null); }} /></SocialProfileProvider></RepositoryProvider>;
  } else if (session) {
    content = <RepositoryProvider value={repository}><SocialProfileProvider key={session.user.id}><LibraryScreen key={session.user.id} email={session.user.email ?? 'Your account'} onPreviewShared={setPreviewId} onPreviewTopic={setPreviewTopic} /></SocialProfileProvider></RepositoryProvider>;
  } else if (guestExplore) {
    content = <RepositoryProvider value={repository}><GuestExploreScreen onSignIn={() => setGuestExplore(false)} onOpenCollection={setPreviewId} onOpenTopic={setPreviewTopic} /></RepositoryProvider>;
  } else {
    content = <AuthScreen onDemo={() => setDemo(createDemoRepository())} onExplore={() => setGuestExplore(true)} callbackError={callbackError} />;
  }
  return <SafeAreaProvider><AppAnalytics /><StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />{content}{previewId ? <Modal visible animationType="slide" onRequestClose={() => setPreviewId(null)}><SharedCollectionScreen collectionId={previewId} repository={demo ?? repository} demo={Boolean(demo)} onBack={() => setPreviewId(null)} /></Modal> : null}{previewTopic ? <Modal visible animationType="slide" onRequestClose={() => setPreviewTopic(null)}><PublicTopicScreen topicKey={previewTopic} repository={demo ?? repository} demo={Boolean(demo)} onBack={() => setPreviewTopic(null)} onOpenCollection={id => { setPreviewTopic(null); setPreviewId(id); }} /></Modal> : null}</SafeAreaProvider>;
}
