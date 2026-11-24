import React, { forwardRef } from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { MAX_BIO_LENGTH } from '../../utils/validators';

export const BioTextarea = forwardRef(
  ({ value, hasError = false, editable = true, ...props }, ref) => {
    const { colors } = useAppTheme();
    const length = typeof value === 'string' ? value.length : 0;

    return (
      <View>
        <TextInput
          ref={ref}
          value={value}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={MAX_BIO_LENGTH}
          editable={editable}
          placeholderTextColor={colors.muted}
          style={[
            styles.textarea,
            {
              color: colors.textPrimary,
              backgroundColor: colors.inputBg,
              borderColor: hasError ? colors.error : colors.borderGlass,
              opacity: editable ? 1 : 0.4,
            },
          ]}
          {...props}
        />
        <Text style={[styles.counter, { color: colors.muted }]}>
          {length}/{MAX_BIO_LENGTH}
        </Text>
      </View>
    );
  }
);

BioTextarea.displayName = 'BioTextarea';

const styles = StyleSheet.create({
  textarea: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    minHeight: 110,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
});
