import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { acquiredDateToLocal, todayLocalDate } from '../domain/dates';
import { Button, ui } from './ui';

export type AcquiredDateFieldProps = { value: string | null; onChange: (value: string | null) => void; disabled?: boolean };

export function AcquiredDateField({ value, onChange, disabled }: AcquiredDateFieldProps) {
  const [open, setOpen] = useState(false);
  if (value === null) return <View><Text style={ui.label}>Acquired date</Text><View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>No date added</Text><Button title="Add date" secondary onPress={() => onChange(todayLocalDate())} disabled={disabled} /></View></View>;
  return <View>
    <Text style={ui.label}>Acquired date</Text>
    <View style={ui.row}>
      <Button title={value} icon={CalendarDays} secondary onPress={() => setOpen(true)} disabled={disabled} style={{ flex: 1 }} />
      <Button title="Today" secondary onPress={() => onChange(todayLocalDate())} disabled={disabled} />
    </View>
    {open ? <View>
      <DateTimePicker value={acquiredDateToLocal(value)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={acquiredDateToLocal('0001-01-01')} maximumDate={acquiredDateToLocal('9999-12-31')} disabled={disabled} onChange={(event, date) => {
        if (Platform.OS !== 'ios') setOpen(false);
        if (event.type === 'set' && date) onChange(todayLocalDate(date));
      }} />
      {Platform.OS === 'ios' ? <Button title="Done" secondary onPress={() => setOpen(false)} /> : null}
    </View> : null}
  </View>;
}
