import { Tabs } from 'expo-router';
import { c, font } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.charcoal },
        headerTintColor: c.white,
        headerTitleStyle: { fontFamily: font.display },
        tabBarActiveTintColor: c.orangeDark,
        tabBarLabelStyle: { fontFamily: font.bold },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Eventos' }} />
      <Tabs.Screen name="races" options={{ title: 'Corridas' }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos' }} />
    </Tabs>
  );
}
