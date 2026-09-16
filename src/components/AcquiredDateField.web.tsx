import React from 'react';
import { Text, View } from 'react-native';
import type { AcquiredDateFieldProps } from './AcquiredDateField';
import { todayLocalDate } from '../domain/dates';
import { Button, colors, fonts, ui } from './ui';

export function AcquiredDateField({ value, onChange, disabled }: AcquiredDateFieldProps) {
  return <View>
    <Text style={ui.label}>Acquired date</Text>
    <View style={ui.row}>
      <input aria-label="Acquired date" type="date" min="0001-01-01" max="9999-12-31" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} style={{ minWidth: 0, flex: 1, boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: `1px solid ${colors.line}`, background: colors.card, color: colors.ink, padding: 12, fontFamily: fonts.body, fontSize: 15 }} />
      <Button title="Today" secondary onPress={() => onChange(todayLocalDate())} disabled={disabled} />
    </View>
  </View>;
}
