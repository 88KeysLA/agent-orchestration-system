/**
 * Visual Playlist - Auto-advance through visuals
 */

export class VisualPlaylist {
  constructor() {
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.interval = null;
    this.duration = 10000; // 10 seconds per visual
  }

  add(bpm, mood) {
    this.playlist.push({ bpm, mood });
  }

  clear() {
    this.playlist = [];
    this.currentIndex = 0;
  }

  start(onVisualChange) {
    if (this.playlist.length === 0) return;
    
    this.isPlaying = true;
    this.currentIndex = 0;
    
    // Play first visual
    onVisualChange(this.playlist[0]);
    
    // Auto-advance
    this.interval = setInterval(() => {
      this.next();
      if (this.currentIndex < this.playlist.length) {
        onVisualChange(this.playlist[this.currentIndex]);
      } else {
        this.stop();
      }
    }, this.duration);
  }

  stop() {
    this.isPlaying = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
  }

  // Demo playlist presets
  static createDemoPlaylist() {
    const playlist = new VisualPlaylist();
    
    // Journey through genres
    playlist.add(66, 'calm');        // Classical
    playlist.add(93, 'dark');        // Hip Hop
    playlist.add(120, 'happy');      // Pop
    playlist.add(128, 'energetic');  // EDM
    playlist.add(140, 'dark');       // Trance
    playlist.add(174, 'energetic');  // DnB
    
    return playlist;
  }

  static createGenreShowcase(genre) {
    const playlist = new VisualPlaylist();
    
    const showcases = {
      edm: [
        { bpm: 126, mood: 'happy' },
        { bpm: 128, mood: 'energetic' },
        { bpm: 128, mood: 'mysterious' }
      ],
      rock: [
        { bpm: 93, mood: 'energetic' },
        { bpm: 116, mood: 'energetic' },
        { bpm: 120, mood: 'dark' }
      ],
      chill: [
        { bpm: 66, mood: 'calm' },
        { bpm: 70, mood: 'calm' },
        { bpm: 80, mood: 'mysterious' }
      ]
    };
    
    const items = showcases[genre] || showcases.edm;
    items.forEach(({ bpm, mood }) => playlist.add(bpm, mood));
    
    return playlist;
  }
}
