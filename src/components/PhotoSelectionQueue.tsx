import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Trash2 } from 'lucide-react-native';
import type { BatchUploadJob } from '../domain/batchUpload';
import { MAX_PHOTO_SELECTION } from '../domain/photoSelection';
import { colors, fonts, ui } from './ui';

export function PhotoSelectionQueue({ jobs, onRemove, disabled = false }: { jobs: BatchUploadJob[]; onRemove: (id: string) => void; disabled?: boolean }) {
  if (!jobs.length) return null;
  return <View style={{ gap: 8 }}>
    <Text style={ui.label}>Photos ({jobs.length}/{MAX_PHOTO_SELECTION})</Text>
    <Text style={[ui.muted, { fontSize: 12, lineHeight: 18 }]}>Each photo becomes a separate item with the same starting details. You can edit their names afterward.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {jobs.map((job, index) => <View key={job.id} style={{ width: 112, gap: 5 }}>
        <View style={{ width: 112, height: 112, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pale }}>
          <Image source={{ uri: job.asset.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" accessibilityLabel={`Selected photo ${index + 1}`} />
          {!disabled ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} onPress={() => onRemove(job.id)} style={{ position: 'absolute', top: 5, right: 5, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}><Trash2 size={18} color={colors.danger} /></Pressable> : null}
        </View>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.medium, fontSize: 11 }}>Photo {index + 1}</Text>
        {job.status !== 'queued' ? <Text numberOfLines={1} style={[ui.muted, { fontSize: 10 }]}>{job.status === 'saved' ? 'Saved' : job.status === 'failed' ? 'Needs attention' : job.status}</Text> : null}
        {job.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{job.error}</Text> : null}
      </View>)}
    </ScrollView>
  </View>;
}
