import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { FolderHeart, Grid2X2, Layers3, Plus } from 'lucide-react-native';
import type { Category, CollectionSummary } from '../domain/models';
import { colors, fonts, ui } from './ui';

type Props = {
  collections: CollectionSummary[];
  categories: Category[];
  selectedCollectionId?: string;
  selectedCategoryId?: string;
  compact?: boolean;
  onSelectCollection: (id?: string) => void;
  onSelectCategory: (collectionId: string, categoryId?: string) => void;
  onAddCollection: () => void;
  onAddCategory: (collectionId: string) => void;
};

function NavButton({ label, active, onPress, depth = 0, icon }: { label: string; active: boolean; onPress: () => void; depth?: number; icon: 'all' | 'collection' | 'category' }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})} onPress={onPress} style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 11, marginLeft: depth * 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: active ? colors.pale : pressed ? '#F0F2EC' : 'transparent', borderWidth: 1, borderColor: active ? '#C7D6C6' : colors.line }]}>
    {icon === 'all' ? <Grid2X2 size={18} color={colors.green} /> : icon === 'collection' ? <FolderHeart size={18} color={colors.green} /> : <Layers3 size={16} color={colors.green} />}
    <Text numberOfLines={1} style={{ color: active ? colors.green : colors.ink, fontFamily: active ? fonts.bold : fonts.medium, fontSize: 14, flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}

export function CollectionNavigator({ collections, categories, selectedCollectionId, selectedCategoryId, compact = false, onSelectCollection, onSelectCategory, onAddCollection, onAddCategory }: Props) {
  const content = <View style={{ gap: 7 }}>
    <View style={[ui.row, { justifyContent: 'space-between', paddingHorizontal: compact ? 0 : 2 }]}><Text style={[ui.label, { marginBottom: 0 }]}>Collections</Text><Pressable accessibilityRole="button" accessibilityLabel="New collection" onPress={onAddCollection} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Plus size={20} color={colors.green} /></Pressable></View>
    <NavButton label="All collections" icon="all" active={!selectedCollectionId} onPress={() => onSelectCollection()} />
    {collections.map(collection => {
      const childCategories = categories.filter(category => category.collection_id === collection.id);
      const open = selectedCollectionId === collection.id;
      return <View key={collection.id} style={{ gap: 6 }}>
        <NavButton label={collection.name} icon="collection" active={open && !selectedCategoryId} onPress={() => onSelectCollection(collection.id)} />
        {open ? <>
          <NavButton label="All entries" icon="all" depth={1} active={!selectedCategoryId} onPress={() => onSelectCategory(collection.id)} />
          {childCategories.map(category => <NavButton key={category.id} label={category.name} icon="category" depth={1} active={selectedCategoryId === category.id} onPress={() => onSelectCategory(collection.id, category.id)} />)}
          <Pressable accessibilityRole="button" accessibilityLabel="New category" onPress={() => onAddCategory(collection.id)} style={{ minHeight: 40, marginLeft: 14, paddingHorizontal: 11, alignItems: 'center', flexDirection: 'row', gap: 8 }}><Plus size={16} color={colors.green} /><Text style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 13 }}>New category</Text></Pressable>
        </> : null}
      </View>;
    })}
  </View>;
  if (!compact) return content;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 2 }}>{<View style={{ width: 255, paddingRight: 10 }}>{content}</View>}</ScrollView>;
}
