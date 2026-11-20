import { Redirect, useLocalSearchParams } from 'expo-router';

/** Invite links (yatri://join/K7P2QX) open the Group ride screen with the code filled in. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/group', params: { code } }} />;
}
