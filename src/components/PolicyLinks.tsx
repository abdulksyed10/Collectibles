import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { PublicInfoScreen, type PublicInfoPage } from '../screens/PublicInfoScreen';
import { Button } from './ui';
export function PolicyLinks() {
  const [page, setPage] = useState<PublicInfoPage | null>(null);
  return <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {(['terms','community','privacy','support','delete-account'] as const).map(value => <Button key={value} title={value==='terms'?'Terms of use':value==='community'?'Community rules':value==='privacy'?'Privacy':value==='support'?'Support':'Account deletion'} secondary onPress={() => setPage(value)} />)}
    </View>
    {page ? <Modal visible animationType="slide" onRequestClose={() => setPage(null)}><PublicInfoScreen page={page} onBack={() => setPage(null)} /></Modal> : null}
  </View>;
}
