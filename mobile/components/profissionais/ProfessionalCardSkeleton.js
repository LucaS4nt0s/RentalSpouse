import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const ProfessionalCardSkeleton = () => {
  const { colors } = useAppTheme();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <Animated.View
            style={[
              styles.avatar,
              { backgroundColor: colors.surface2, opacity: pulseAnim },
            ]}
          />
          <View style={styles.nameCol}>
            <Animated.View
              style={[
                styles.namePlaceholder,
                { backgroundColor: colors.surface2, opacity: pulseAnim },
              ]}
            />
            <Animated.View
              style={[
                styles.locationPlaceholder,
                { backgroundColor: colors.surface2, opacity: pulseAnim },
              ]}
            />
          </View>
        </View>

        <Animated.View
          style={[
            styles.badgePlaceholder,
            { backgroundColor: colors.surface2, opacity: pulseAnim },
          ]}
        />
      </View>

      {/* Chips */}
      <View style={styles.chipsRow}>
        <Animated.View
          style={[
            styles.chipPlaceholder,
            { backgroundColor: colors.surface2, opacity: pulseAnim, width: 60 },
          ]}
        />
        <Animated.View
          style={[
            styles.chipPlaceholder,
            { backgroundColor: colors.surface2, opacity: pulseAnim, width: 80 },
          ]}
        />
        <Animated.View
          style={[
            styles.chipPlaceholder,
            { backgroundColor: colors.surface2, opacity: pulseAnim, width: 50 },
          ]}
        />
      </View>

      {/* Bio lines */}
      <View style={styles.bioContainer}>
        <Animated.View
          style={[
            styles.bioLine,
            { backgroundColor: colors.surface2, opacity: pulseAnim, width: '100%' },
          ]}
        />
        <Animated.View
          style={[
            styles.bioLine,
            { backgroundColor: colors.surface2, opacity: pulseAnim, width: '85%' },
          ]}
        />
      </View>

      {/* Button placeholder */}
      <Animated.View
        style={[
          styles.buttonPlaceholder,
          { backgroundColor: colors.surface2, opacity: pulseAnim },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  nameCol: {
    flex: 1,
    gap: 6,
  },
  namePlaceholder: {
    height: 14,
    width: 120,
    borderRadius: 6,
  },
  locationPlaceholder: {
    height: 10,
    width: 160,
    borderRadius: 6,
  },
  badgePlaceholder: {
    height: 22,
    width: 60,
    borderRadius: 11,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  chipPlaceholder: {
    height: 24,
    borderRadius: 8,
  },
  bioContainer: {
    marginTop: 12,
    gap: 6,
  },
  bioLine: {
    height: 10,
    borderRadius: 5,
  },
  buttonPlaceholder: {
    height: 44,
    borderRadius: 14,
    marginTop: 14,
  },
});
