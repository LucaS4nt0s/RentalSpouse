import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  ShieldCheck,
  MapPin,
  MessageSquare,
} from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const ProfessionalCardMobile = ({
  professional,
  activeSpecialty,
  onSpecialtyPress,
  onRequestQuote,
}) => {
  const { colors } = useAppTheme();

  // Iniciais do profissional
  const getInitials = (name) => {
    if (!name) return 'RS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(professional.name);

  // Localização
  const location = [
    professional.city,
    professional.state ? professional.state.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  const radius = professional.service_radius_km
    ? `Raio de ${Math.round(professional.service_radius_km)} km`
    : null;

  const fullLocation = [location, radius].filter(Boolean).join(' • ');

  const specialties = professional.specialties || [];
  const displayedSpecs = specialties.slice(0, 3);
  const remainingCount = specialties.length - displayedSpecs.length;

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
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.surface2, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {initials}
            </Text>
          </View>

          <View style={styles.nameCol}>
            <Text
              style={[styles.nameText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {professional.name}
            </Text>
            {fullLocation ? (
              <View style={styles.locationRow}>
                <MapPin size={12} color={colors.primary} />
                <Text
                  style={[styles.locationText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {fullLocation}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {professional.approval_status === 'approved' && (
          <View
            style={[
              styles.verifiedBadge,
              { backgroundColor: `${colors.success}18` },
            ]}
          >
            <ShieldCheck size={14} color={colors.success} />
            <Text style={[styles.verifiedText, { color: colors.success }]}>
              Verificado
            </Text>
          </View>
        )}
      </View>

      {/* Specialties Badges */}
      <View style={styles.chipsRow}>
        {displayedSpecs.map((spec) => {
          const isHighlighted =
            activeSpecialty &&
            spec.toLowerCase() === activeSpecialty.toLowerCase();

          return (
            <TouchableOpacity
              key={spec}
              activeOpacity={0.7}
              onPress={() => onSpecialtyPress && onSpecialtyPress(spec)}
              style={[
                styles.specChip,
                {
                  backgroundColor: isHighlighted ? colors.primary : colors.surface2,
                  borderColor: isHighlighted ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.specChipText,
                  {
                    color: isHighlighted ? colors.primaryText : colors.textSecondary,
                    fontWeight: isHighlighted ? '700' : '500',
                  },
                ]}
              >
                {spec}
              </Text>
            </TouchableOpacity>
          );
        })}
        {remainingCount > 0 ? (
          <View
            style={[
              styles.specChip,
              {
                backgroundColor: colors.surface2,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.specChipText,
                { color: colors.textSecondary },
              ]}
            >
              +{remainingCount}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Bio line clamp 3 */}
      <Text
        style={[styles.bioText, { color: colors.textSecondary }]}
        numberOfLines={3}
      >
        {professional.bio || 'Profissional qualificado disponível para serviços residenciais.'}
      </Text>

      {/* CTA Button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onRequestQuote && onRequestQuote(professional)}
        style={[
          styles.ctaButton,
          {
            backgroundColor: colors.primary,
          },
        ]}
      >
        <MessageSquare size={16} color={colors.primaryText} />
        <Text style={[styles.ctaButtonText, { color: colors.primaryText }]}>
          Solicitar Orçamento
        </Text>
      </TouchableOpacity>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  specChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  specChipText: {
    fontSize: 11,
  },
  bioText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
