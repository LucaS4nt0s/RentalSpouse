import React, { useState, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  SlidersHorizontal,
  RotateCcw,
  SearchX,
  RefreshCw,
  WifiOff,
  Sparkles,
} from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { SearchBarMobile } from '../components/profissionais/SearchBarMobile';
import { CategoryHorizontalList } from '../components/profissionais/CategoryHorizontalList';
import { ProfessionalCardMobile } from '../components/profissionais/ProfessionalCardMobile';
import { ProfessionalCardSkeleton } from '../components/profissionais/ProfessionalCardSkeleton';
import { FilterBottomSheet } from '../components/profissionais/FilterBottomSheet';
import { useProfessionalsSearch } from '../hooks/useProfessionalsSearch';

export const ProfessionalSearchScreen = ({ onNavigateBack }) => {
  const { colors, isDark } = useAppTheme();

  // Filtros
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Debounce de busca de 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Hook central de busca e estados
  const {
    data,
    isLoading,
    isRefreshing,
    error,
    isEmpty,
    detectedSuggestion,
    refresh,
    retry,
  } = useProfessionalsSearch({
    specialty,
    city,
    q: debouncedQuery,
  });

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      (specialty && specialty !== 'Todas') ||
        city ||
        debouncedQuery
    );
  }, [specialty, city, debouncedQuery]);

  const handleSelectCategory = (cat) => {
    if (cat === 'Todas' || cat === specialty) {
      setSpecialty('');
    } else {
      setSpecialty(cat);
    }
  };

  const handleClearAllFilters = () => {
    setSpecialty('');
    setCity('');
    setSearchQuery('');
    setDebouncedQuery('');
  };

  const handleRequestQuote = (prof) => {
    Alert.alert(
      'Solicitar Orçamento',
      `Deseja iniciar um chamado para ${prof.name} (${prof.city || 'Atendimento local'})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: () =>
            Alert.alert(
              'Solicitação Enviada',
              `O profissional ${prof.name} recebeu seu pedido de contato!`
            ),
        },
      ]
    );
  };

  const renderHeader = () => (
    <View style={styles.headerArea}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <SearchBarMobile
          value={searchQuery}
          onChangeText={setSearchQuery}
          isLoading={isLoading && Boolean(searchQuery)}
          onClear={() => setSearchQuery('')}
        />
      </View>

      {/* Horizontal Category Chips */}
      <CategoryHorizontalList
        activeCategory={specialty || 'Todas'}
        onSelectCategory={handleSelectCategory}
      />

      {/* Control / Filter Action Bar */}
      <View
        style={[
          styles.filterBar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
          {isLoading ? (
            'Buscando...'
          ) : (
            <>
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {data.length}
              </Text>{' '}
              {data.length === 1 ? 'profissional' : 'profissionais'}
            </>
          )}
        </Text>

        <View style={styles.filterActions}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setFilterModalVisible(true)}
            style={[
              styles.filterBtn,
              {
                backgroundColor: city ? colors.primary : colors.surface2,
                borderColor: colors.border,
              },
            ]}
          >
            <SlidersHorizontal
              size={14}
              color={city ? colors.primaryText : colors.textSecondary}
            />
            <Text
              style={[
                styles.filterBtnText,
                {
                  color: city ? colors.primaryText : colors.textSecondary,
                  fontWeight: city ? '700' : '600',
                },
              ]}
            >
              {city ? city : 'Cidade'}
            </Text>
          </TouchableOpacity>

          {hasActiveFilters && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClearAllFilters}
              style={[
                styles.clearFiltersBtn,
                { borderColor: colors.border },
              ]}
            >
              <RotateCcw size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Banner de Sugestão / Aproximação Estilo Spotify / YouTube */}
      {detectedSuggestion && searchQuery.trim() && !isLoading ? (
        <View
          style={[
            styles.suggestionBanner,
            {
              backgroundColor: `${colors.primary}12`,
              borderColor: `${colors.primary}35`,
            },
          ]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text
            style={[styles.suggestionText, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            Buscando por "{searchQuery.trim()}" • Aproximação:{' '}
            <Text style={{ fontWeight: '700', color: colors.primary }}>
              {detectedSuggestion}
            </Text>
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />

      {/* Top Navigation */}
      <View style={[styles.topNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={onNavigateBack}
          style={styles.backBtn}
          accessibilityLabel="Voltar"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>
          Buscar Profissionais
        </Text>

        <ThemeToggle />
      </View>

      {/* Content */}
      {isLoading && !isRefreshing ? (
        <View style={{ flex: 1 }}>
          {renderHeader()}
          <View style={styles.skeletonsList}>
            {Array.from({ length: 4 }).map((_, index) => (
              <ProfessionalCardSkeleton key={index} />
            ))}
          </View>
        </View>
      ) : error ? (
        <View style={{ flex: 1 }}>
          {renderHeader()}
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: colors.surface,
                borderColor: `${colors.error}40`,
              },
            ]}
          >
            <WifiOff size={32} color={colors.error} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              Ops! Falha na conexão
            </Text>
            <Text style={[styles.errorDesc, { color: colors.textSecondary }]}>
              {error}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={retry}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <RefreshCw size={16} color={colors.primaryText} />
              <Text style={[styles.retryBtnText, { color: colors.primaryText }]}>
                Tentar Novamente
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : isEmpty ? (
        <View style={{ flex: 1 }}>
          {renderHeader()}
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <SearchX size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Nenhum profissional encontrado
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              Tente buscar por outra especialidade ou remova os filtros de cidade para ver mais resultados.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleClearAllFilters}
              style={[styles.clearBtn, { backgroundColor: colors.primary }]}
            >
              <RotateCcw size={16} color={colors.primaryText} />
              <Text style={[styles.clearBtnText, { color: colors.primaryText }]}>
                Limpar todos os filtros
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <ProfessionalCardMobile
              professional={item}
              activeSpecialty={specialty}
              onSpecialtyPress={handleSelectCategory}
              onRequestQuote={handleRequestQuote}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          // Otimizações de performance especificadas no PRD Section 6.2
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        initialCity={city}
        onApply={({ city: c }) => {
          setCity(c);
        }}
        onReset={() => {
          setCity('');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerArea: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  resultsCount: {
    fontSize: 13,
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterBtnText: {
    fontSize: 12,
  },
  clearFiltersBtn: {
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  listContainer: {
    paddingBottom: 24,
  },
  skeletonsList: {
    flex: 1,
  },
  errorCard: {
    margin: 20,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    margin: 20,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  suggestionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 12,
    flex: 1,
  },
});
