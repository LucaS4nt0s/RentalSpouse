import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const SearchBarMobile = ({
  value,
  onChangeText,
  placeholder = 'Buscar por nome, especialidade ou termo...',
  isLoading = false,
  onClear,
}) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.iconContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Search size={18} color={colors.textSecondary} />
        )}
      </View>

      <TextInput
        style={[
          styles.input,
          {
            color: colors.textPrimary,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        returnKeyType="search"
        accessibilityLabel="Buscar profissionais"
      />

      {value ? (
        <TouchableOpacity
          onPress={onClear || (() => onChangeText(''))}
          activeOpacity={0.7}
          style={styles.clearButton}
          accessibilityLabel="Limpar texto de busca"
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  iconContainer: {
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
