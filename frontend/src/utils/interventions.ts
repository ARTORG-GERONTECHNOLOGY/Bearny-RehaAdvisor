//utils/interventions.ts
export const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      // Helper function to check if a URL contains a domain
      const isDomain = (url: string, domain: string) => url.includes(domain);
      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'primary';
      if (isDomain(link, 'vimeo.com')) return 'primary';

      return 'warning'; // Link
    }

    if (mediaUrl.endsWith('.mp4')) return 'primary';
    if (mediaUrl.endsWith('.mp3')) return 'info';
    if (mediaUrl.endsWith('.pdf')) return 'danger';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'success';


    return 'secondary'; // Default for unknown file types
  };

  export const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      // Helper function to check if a URL contains a domain
      const isDomain = (url: string, domain: string) => url.includes(domain);

      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'Video';
      if (isDomain(link, 'vimeo.com')) return 'Video';
      if (link.endsWith('.mp4')) return 'Video';
      if (link.endsWith('.mp4')) return 'Video';
      if (link.endsWith('.mp3')) return 'Audio';
      if (link.endsWith('.pdf')) return 'PDF';
      

      return 'Link';
    }

    if (mediaUrl.endsWith('.mp4')) return 'Video';
    if (mediaUrl.endsWith('.mp3')) return 'Audio';
    if (mediaUrl.endsWith('.pdf')) return 'PDF';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'Image';

    return 'Unknown';
  };

  // Function to generate color spectrum based on available tags
  export const generateTagColors = (tags: string[]) => {
    const tagColors: Record<string, string> = {};

    tags.forEach((tag, index) => {
      const hue = (index * 360) / tags.length; // Spread colors evenly in HSL spectrum
      tagColors[tag] = `hsl(${hue}, 70%, 50%)`; // Generate HSL color
    });

    return tagColors;
  };

  