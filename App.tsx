import React, { useEffect, useState } from 'react';
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
export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, InstrumentSerif_400Regular });
  const { session, loading, recovery, finishRecovery } = useSession();
  const [demo, setDemo] = useState<CollectionRepository | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(() => Platform.OS === 'web' && typeof window !== 'undefined' ? sharedIdFromUrl(window.location.href) : null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const changed = () => setSharedId(sharedIdFromUrl(window.location.href));
      window.addEventListener('popstate', changed);
      return () => window.removeEventListener('popstate', changed);
    }
    let active = true;
    void Linking.getInitialURL().then(url => { if (active) setSharedId(sharedIdFromUrl(url)); });
    const listener = Linking.addEventListener('url', event => setSharedId(sharedIdFromUrl(event.url)));
    return () => { active = false; listener.remove(); };
  }, []);
  function leaveSharedView() {
    setSharedId(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href); url.searchParams.delete('collection');
      window.history.replaceState({}, '', url.toString());
    }
  }
  let content;
  if ((!fontsLoaded && !fontError) || (loading && !sharedId)) {
    content = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /><Text style={{ marginTop: 14, color: colors.ink }}>Opening your collection…</Text></View>;
  } else if (sharedId) {
    content = <SharedCollectionScreen collectionId={sharedId} repository={repository} onBack={leaveSharedView} />;
  } else if (demo) {
    content = <RepositoryProvider value={demo}><LibraryScreen key="demo" email="Demo collector" onPreviewShared={setPreviewId} onExitDemo={() => { setPreviewId(null); setDemo(null); }} /></RepositoryProvider>;
  } else if (recovery) {
    content = <RecoveryScreen onDone={finishRecovery} />;
  } else if (session) {
    content = <RepositoryProvider value={repository}><LibraryScreen key={session.user.id} email={session.user.email ?? 'Your account'} onPreviewShared={setPreviewId} /></RepositoryProvider>;
  } else {
    content = <AuthScreen onDemo={() => setDemo(createDemoRepository())} />;
  }
  return <SafeAreaProvider><StatusBar style="dark" />{content}{previewId ? <Modal visible animationType="slide" onRequestClose={() => setPreviewId(null)}><SharedCollectionScreen collectionId={previewId} repository={demo ?? repository} demo={Boolean(demo)} onBack={() => setPreviewId(null)} /></Modal> : null}</SafeAreaProvider>;
}
