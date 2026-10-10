import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand, Button, colors, fonts, ui } from '../components/ui';

export type PublicInfoPage = 'privacy' | 'terms' | 'community' | 'support' | 'delete-account';

const pageTitle: Record<PublicInfoPage, string> = {
  privacy: 'Privacy',
  terms: 'Terms of use',
  community: 'Community rules',
  support: 'Support',
  'delete-account': 'Delete account',
};

import { publisherName, supportEmail } from '../lib/publisher';
function mailUrl(address: string, subject: string, body = '') { return `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }

function Paragraph({ children }: { children: React.ReactNode }) { return <Text style={[ui.text, { lineHeight: 23 }]}>{children}</Text>; }
function Heading({ children }: { children: React.ReactNode }) { return <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 18, marginTop: 10 }}>{children}</Text>; }
function Bullet({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: 'row', gap: 9 }}><Text style={ui.text}>•</Text><Text style={[ui.text, { flex: 1, lineHeight: 22 }]}>{children}</Text></View>; }

export function PublicInfoScreen({ page, onBack }: { page: PublicInfoPage; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const address = supportEmail;
  const canContact = Boolean(address);
  const deletionBody = useMemo(() => `Account email: ${email.trim() || '[enter your account email]'}\n\nPlease delete my Collectibles account and personal data.`, [email]);
  async function openSupport(subject: string, body?: string) {
    if (!address) { setMessage('Email support is temporarily unavailable. Please try again later.'); return; }
    try { await Linking.openURL(mailUrl(address, subject, body)); }
    catch { setMessage('Your email app could not be opened. Copy the support address and contact us there.'); }
  }
  const content = page === 'privacy' ? <>
    <Paragraph>Collectibles lets you keep a personal record of the things you collect. Entries are private by default. You choose whether each entry stays private, appears in public Explore, or is shared with mutual followers.</Paragraph>
    <Heading>Information we use</Heading>
    <Bullet>Account email and authentication session data to sign you in and secure your account.</Bullet>
    <Bullet>Collection names, categories, entry details, acquired dates, and photos that you add to provide the app.</Bullet>
    <Bullet>Basic service and security records such as upload counters, failed sign-in protection, reports, and account-deletion records.</Bullet>
    <Heading>When an entry is public</Heading>
    <Paragraph>Only the entry title, collection name, photo, username, follow relationship, and like count needed for sharing are visible. Usernames, follow relationships, and like counts are visible with shared entries. Notes, acquired dates, account email, storage keys, and private entries are not included. Friends-only entries are visible only to mutual followers. Public content can be viewed or copied by other people; removing it stops new access but cannot recall screenshots or files already saved.</Paragraph>
    <Heading>Service providers and retention</Heading>
    <Paragraph>Collectibles uses Supabase for authentication and database services, Cloudflare R2 for private photo storage, Cloudflare Turnstile for abuse prevention, and Vercel for the hosted web app. These services process network and security information, including IP addresses. Google and Apple process sign-in information when their login option is enabled and used. Optional web traffic analytics exclude account details, entry identifiers and authentication links. Deleting an account removes its app data and photos through the deletion flow. Resolved reports are removed after 30 days, moderation audit records after 90 days, and short-term signup/report counters after two days. Open reports remain until resolved. Minimal photo deletion guards and lifetime storage counters remain to prevent late writes and limit abuse. Provider deletion failures are retried and retained until resolved. Service logs and backups follow each provider’s configured retention; a restored backup must have deletions reapplied before use.</Paragraph>
    <Heading>Your choices</Heading>
    <Paragraph>You can change an entry to private, delete entries, or delete your account in the app. If you cannot sign in, use the deletion-request page. Contact support for privacy questions or requests.</Paragraph>
  </> : page === 'terms' ? <>
    <Paragraph>Use Collectibles to organize your own collection and to share entries you are allowed to share. You are responsible for the accuracy of your entries and for respecting other people’s rights.</Paragraph>
    <Heading>Public sharing</Heading>
    <Bullet>Visibility applies to each entry, not an entire collection or category. Friends-only entries are available only when two collectors follow each other.</Bullet>
    <Bullet>Public entries appear in Explore when shared. Content can be hidden for review after reports from five different signed-in members.</Bullet>
    <Bullet>Do not upload unlawful, infringing, deceptive, private, or harmful content.</Bullet>
    <Heading>Account and service</Heading>
    <Paragraph>Keep your account credentials private. Do not attempt to bypass limits, scrape the service, interfere with its operation, or use it to harass others. We may suspend public publishing or restrict access when needed to protect people or the service.</Paragraph>
    <Heading>Contact</Heading>
    <Paragraph>Questions about these terms can be sent to the support contact on this site.</Paragraph>
  </> : page === 'community' ? <>
    <Paragraph>Explore is for sharing collectible entries. Be respectful and follow these rules when using the app.</Paragraph>
    <Heading>Do not share</Heading>
    <Bullet>Sexual content, exploitation, graphic violence, hate, threats, harassment, or content that encourages dangerous activity.</Bullet>
    <Bullet>Scams, impersonation, spam, misleading listings, or attempts to obtain money or personal information.</Bullet>
    <Bullet>Someone else’s private information, including addresses, contact details, account credentials, or photos you do not have permission to publish.</Bullet>
    <Bullet>Copyrighted or trademarked material when you do not have the right to share it.</Bullet>
    <Heading>Reporting and blocking</Heading>
    <Paragraph>Only signed-in members can report shared content. Reports from five different signed-in members hide the reported entry or collection from Explore and send it to review. Anyone can block a collector from their own view: guest blocks apply on that device, while signed-in blocks apply to the account. Blocking does not hide a collector’s content for other people. Content may be removed and repeated violations can lead to publishing restrictions.</Paragraph>
  </> : page === 'support' ? <>
    <Paragraph>Need help with Collectibles? Include your account email, device type, app version, and a short description of the problem. Do not send your password, recovery code, R2 keys, or other credentials.</Paragraph>
    {canContact ? <Button title={`Email ${address}`} icon={Mail} onPress={() => { void openSupport('Collectibles support request'); }} /> : <Text style={[ui.text, { color: colors.danger }]}>Email support is temporarily unavailable.</Text>}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text> : null}
  </> : <>
    <Paragraph>To delete your account while signed in, open Collectibles, choose your account button, then choose Delete my account. This removes your app data and requests removal of stored photos.</Paragraph>
    <Button title="Sign in to delete my account" secondary onPress={onBack} /><Heading>Cannot sign in?</Heading>
    <Paragraph>Enter the email used for your account. Your mail app will open a deletion request to the support team. We may ask you to verify ownership before deleting an account.</Paragraph>
    <TextInput accessibilityLabel="Account email for deletion request" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.muted} style={{ minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 13, color: colors.ink, fontFamily: fonts.body }} />
    <Button title="Request account deletion" icon={Mail} onPress={() => { void openSupport('Collectibles account deletion request', deletionBody); }} disabled={!canContact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} />
    {!canContact ? <Text style={[ui.text, { color: colors.danger }]}>Email support is temporarily unavailable.</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text> : null}
  </>;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[ui.row, { paddingHorizontal: 16, minHeight: 62, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}><Button title="Back" icon={ArrowLeft} secondary onPress={onBack} /><Brand small /></View>
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 16 }}>
      <Text style={[ui.title, { fontSize: 34, lineHeight: 39 }]}>{pageTitle[page]}</Text>
      <Text style={ui.muted}>Published by {publisherName}</Text>
      <View style={{ gap: 14 }}>{content}</View>
      <Text selectable style={ui.muted}>Contact: {address}</Text>
      <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 16, gap: 8 }}>
        <Text style={[ui.muted, { fontSize: 12 }]}>Collectibles · Last updated October 10, 2026</Text>
        {Platform.OS === 'web' ? <Pressable accessibilityRole="link" onPress={onBack} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: colors.green, fontFamily: fonts.bold }}>Return to Collectibles</Text></Pressable> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
