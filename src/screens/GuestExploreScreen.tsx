import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand, Button, colors, ui } from '../components/ui';
import { PublicCatalog } from './PublicCatalog';

export function GuestExploreScreen({ onSignIn, onOpenCollection, onOpenTopic }: { onSignIn: () => void; onOpenCollection: (collectionId: string) => void; onOpenTopic: (topicKey: string) => void }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { minHeight: 56, paddingHorizontal: 16, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Brand small /><Button title="Sign in" secondary onPress={onSignIn} /></View>
    <PublicCatalog onLibrary={onSignIn} libraryLabel="Sign in" onOpenCollection={onOpenCollection} onOpenTopic={onOpenTopic} />
  </SafeAreaView>;
}
