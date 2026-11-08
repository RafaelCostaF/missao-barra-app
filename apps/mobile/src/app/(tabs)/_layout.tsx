import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { c, font } from '@/theme';
import { useIsAdmin } from '@/components/admin/kit';

export default function TabsLayout() {
  // Aba da organização só para admin (o banco bloqueia os dados para os demais de qualquer forma).
  const { admin } = useIsAdmin();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.charcoal },
        headerTintColor: c.white,
        headerTitleStyle: { fontFamily: font.display },
        tabBarActiveTintColor: c.orangeDark,
        tabBarLabelStyle: { fontFamily: font.bold, fontSize: 11 },
        tabBarStyle: { borderTopColor: c.line, height: 64, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="races" options={{ title: 'Corridas', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos', tabBarIcon: ({ color, size }) => <Ionicons name="person-add-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="admin" options={{ title: 'Gestão', href: admin ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
