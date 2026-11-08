import { useRouter } from 'expo-router';
import { ProfileForm } from '@/components/ProfileForm';

/** Cadastro aberto a partir de um evento: tem "Voltar" no topo e volta sozinho ao salvar. */
export default function Cadastro() {
  const router = useRouter();
  return <ProfileForm onSaved={() => router.back()} />;
}
