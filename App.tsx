import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
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
export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, InstrumentSerif_400Regular });
  const { session, loading, recovery, finishRecovery } = useSession();
  const [demo, setDemo] = useState<CollectionRepository | null>(null);
  let content;
  if ((!fontsLoaded && !fontError) || loading) {
    content = <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /><Text style={{ marginTop: 14, color: colors.ink }}>Opening your collection…</Text></View>;
  } else if (demo) {
    content = <RepositoryProvider value={demo}><LibraryScreen key="demo" email="Demo collector" onExitDemo={() => setDemo(null)} /></RepositoryProvider>;
  } else if (recovery) {
    content = <RecoveryScreen onDone={finishRecovery} />;
  } else if (session) {
    content = <RepositoryProvider value={repository}><LibraryScreen key={session.user.id} email={session.user.email ?? 'Your account'} /></RepositoryProvider>;
  } else {
    content = <AuthScreen onDemo={() => setDemo(createDemoRepository())} />;
  }
  return <SafeAreaProvider><StatusBar style="dark" />{content}</SafeAreaProvider>;
}
