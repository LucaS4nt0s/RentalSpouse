import React from 'react';
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import {
  Zap,
  Droplets,
  Paintbrush,
  Hammer,
  Sparkles,
  Flower2,
  Wind,
  Wrench,
  LayoutGrid,
} from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const CATEGORIES = [
  { id: 'Todas', label: 'Todas', Icon: LayoutGrid },
  { id: 'Elétrica', label: 'Elétrica', Icon: Zap },
  { id: 'Hidráulica', label: 'Hidráulica', Icon: Droplets },
  { id: 'Pintura', label: 'Pintura', Icon: Paintbrush },
  { id: 'Montagem de Móveis', label: 'Montagem de Móveis', Icon: Hammer },
  { id: 'Marcenaria', label: 'Marcenaria', Icon: Hammer },
  { id: 'Limpeza', label: 'Limpeza', Icon: Sparkles },
  { id: 'Jardinagem', label: 'Jardinagem', Icon: Flower2 },
  { id: 'Ar-condicionado', label: 'Ar-condicionado', Icon: Wind },
  { id: 'Reparos Gerais', label: 'Reparos Gerais', Icon: Wrench },
];

export const CategoryHorizontalList = ({
  activeCategory = 'Todas',
  onSelectCategory,
}) => {
  const { colors } = useAppTheme();

  const renderItem = ({ item }) => {
    const isActive =
      (!activeCategory && item.id === 'Todas') ||
      activeCategory.toLowerCase() === item.id.toLowerCase();
    const { Icon, label } = item;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onSelectCategory(item.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        style={[
          styles.chip,
          {
            backgroundColor: isActive ? colors.primary : colors.surface2,
            borderColor: isActive ? colors.primary : colors.border,
          },
        ]}
      >
        <Icon
          size={16}
          color={isActive ? colors.primaryText : colors.primary}
        />
        <Text
          style={[
            styles.chipText,
            {
              color: isActive ? colors.primaryText : colors.textSecondary,
              fontWeight: isActive ? '700' : '600',
            },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={CATEGORIES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44, // Área mínima de toque HIG/Material
    borderRadius: 22,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
});
