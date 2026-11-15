import JSZip from 'jszip';

const androidFiles = {
  ...(import.meta.glob('/android-studio-project/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('/android-studio-project/.github/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
};

export async function downloadAndroidStudioSourceZip(): Promise<void> {
  const zip = new JSZip();
  const prefix = '/android-studio-project/';
  for (const [fullPath, content] of Object.entries(androidFiles)) {
    const relPath = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
    zip.file(relPath, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'SmartDigitalBlackboard-AndroidStudio-Kotlin.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
