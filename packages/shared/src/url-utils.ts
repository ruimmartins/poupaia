export const isValidImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && contentType.startsWith('image/');
  } catch {
    return false;
  }
};
