const API_KEY = 'ce749430f162e63755db27972814f5d1';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// DOM Elements
const blendForm = document.getElementById('blendForm');
const playlistContainer = document.getElementById('playlistContainer');
const playlistDiv = document.getElementById('playlist');
const exportBtn = document.getElementById('exportBtn');
const statusMessage = document.getElementById('statusMessage');
const loadingIndicator = document.getElementById('loadingIndicator');

// Fetch top tracks for a user
async function getTopTracks(username) {
  try {
    const url = `${BASE_URL}?method=user.gettoptracks&user=${username}&period=overall&limit=50&api_key=${API_KEY}&format=json`;
    console.log('Fetching top tracks from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error Response:', errorData);
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Top tracks response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching top tracks:', error);
    throw new Error(`Failed to fetch top tracks for ${username}: ${error.message}`);
  }
}

// Fetch suggested tracks (weekly chart)
async function getSuggestedTracks(username) {
  try {
    const url = `${BASE_URL}?method=user.getweeklytrackchart&user=${username}&api_key=${API_KEY}&format=json`;
    console.log('Fetching suggested tracks from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error Response:', errorData);
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Suggested tracks response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching suggested tracks:', error);
    throw new Error(`Failed to fetch suggested tracks for ${username}: ${error.message}`);
  }
}

// Compare tracks between two users
function findCommonTracks(user1Tracks, user2Tracks) {
  const trackSet = new Set();
  user1Tracks.forEach(track => {
    const artistName = typeof track.artist === 'object' ? track.artist?.name : track.artist;
    const nameLower = (track.name || '').toLowerCase();
    const artistLower = (artistName || '').toLowerCase();
    if (nameLower && artistLower) {
      trackSet.add(`${nameLower}-${artistLower}`);
    }
  });
  
  return user2Tracks.filter(track => {
    const artistName = typeof track.artist === 'object' ? track.artist?.name : track.artist;
    const nameLower = (track.name || '').toLowerCase();
    const artistLower = (artistName || '').toLowerCase();
    return nameLower && artistLower && trackSet.has(`${nameLower}-${artistLower}`);
  });
}

// Process track data into consistent format
function processTrackData(track, isCommon = false) {
  const artistName = typeof track.artist === 'object' ? track.artist?.name : track.artist;
  return {
    name: track.name || 'Unknown Track',
    artist: artistName || 'Unknown Artist',
    playcount: parseInt(track.playcount) || 0,
    common: isCommon,
    // Add normalized fields for comparison
    nameLower: (track.name || '').toLowerCase(),
    artistLower: (artistName || '').toLowerCase()
  };
}

// Generate blended playlist with improved algorithm
async function generatePlaylist(user1, user2) {
  try {
    showLoading(true);
    clearStatus();

    const [user1Top, user2Top, user1Suggested, user2Suggested] = await Promise.all([
      getTopTracks(user1),
      getTopTracks(user2),
      getSuggestedTracks(user1),
      getSuggestedTracks(user2)
    ]);

    // Process all track data with weights
    const user1Tracks = user1Top.toptracks.track.map(t => processTrackData(t));
    const user2Tracks = user2Top.toptracks.track.map(t => processTrackData(t));
    
    // Find common tracks and mark them
    const commonTracks = findCommonTracks(user1Top.toptracks.track, user2Top.toptracks.track)
      .map(t => processTrackData(t, true));

    // Create a balanced blend (inspired by Spotify)
    const blendedTracks = [];
    const maxTracks = 50; // Increased playlist length
    
    // 1. Add common tracks first (40% of playlist)
    const commonCount = Math.min(commonTracks.length, Math.floor(maxTracks * 0.4));
    blendedTracks.push(...commonTracks.slice(0, commonCount));
    
    // 2. Add top tracks from each user (30% each)
    const user1Count = Math.min(user1Tracks.length, Math.floor(maxTracks * 0.3));
    const user2Count = Math.min(user2Tracks.length, Math.floor(maxTracks * 0.3));
    
    // Alternate between users to balance representation
    for (let i = 0; i < Math.max(user1Count, user2Count); i++) {
      if (i < user1Count) blendedTracks.push(user1Tracks[i]);
      if (i < user2Count) blendedTracks.push(user2Tracks[i]);
    }
    
    // 3. Fill remaining slots with suggested tracks (20%)
    const suggestedTracks = [
      ...user1Suggested.weeklytrackchart.track.map(t => processTrackData(t)),
      ...user2Suggested.weeklytrackchart.track.map(t => processTrackData(t))
    ];
    const suggestedCount = Math.min(suggestedTracks.length, maxTracks - blendedTracks.length);
    blendedTracks.push(...suggestedTracks.slice(0, suggestedCount));

    // Remove duplicates
    const uniqueTracks = [];
    const trackSet = new Set();
    blendedTracks.forEach(track => {
      const key = `${track.nameLower}-${track.artistLower}`;
      if (!trackSet.has(key)) {
        trackSet.add(key);
        uniqueTracks.push(track);
      }
    });

    // Sort by relevance (common tracks first, then by combined playcount)
    uniqueTracks.sort((a, b) => {
      if (a.common !== b.common) return b.common - a.common;
      return b.playcount - a.playcount;
    });

    // Limit to maxTracks
    const finalPlaylist = uniqueTracks.slice(0, maxTracks);
    displayPlaylist(finalPlaylist);
    showLoading(false);
  } catch (error) {
    showLoading(false);
    showStatus(`Error: ${error.message}`, 'error');
    console.error('Error generating playlist:', error);
    
    // Log additional debug info
    console.log('User1:', user1);
    console.log('User2:', user2);
    console.log('API Key:', API_KEY);
  }
}

// Display playlist in UI
function displayPlaylist(tracks) {
  playlistDiv.innerHTML = tracks.map(track => `
    <div class="track-item p-3 mb-2 rounded-lg fade-in ${track.common ? 'common-track' : 'bg-gray-50'}">
      <div class="flex items-center">
        ${track.common ? '<span class="text-yellow-500 mr-2"><i class="fas fa-star"></i></span>' : ''}
        <div class="flex-grow">
          <span class="font-semibold text-gray-800">${track.name}</span>
          <span class="text-gray-600"> - ${track.artist}</span>
        </div>
        <span class="text-sm text-gray-500">${track.playcount} plays</span>
      </div>
    </div>
  `).join('');

  playlistContainer.classList.remove('hidden');
  exportBtn.classList.remove('hidden');
}

// Export playlist as CSV
function exportToCSV(tracks) {
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Track,Artist,Play Count,Common\n";
  
  tracks.forEach(track => {
    csvContent += `"${track.name.replace(/"/g, '""')}","${track.artist.replace(/"/g, '""')}",${track.playcount},${track.common ? "Yes" : "No"}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "blended_playlist.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export functionality
function exportPlaylist() {
  const tracks = Array.from(document.querySelectorAll('.track-item')).map(el => {
    return {
      name: el.querySelector('.font-semibold').textContent,
      artist: el.querySelector('.text-gray-600').textContent.replace(' - ', ''),
      playcount: parseInt(el.querySelector('.text-sm').textContent) || 0,
      common: el.classList.contains('common-track')
    };
  });
  
  exportToCSV(tracks);
  showStatus('Playlist exported as CSV!', 'success');
}

// UI Helpers
function showLoading(show) {
  if (show) {
    loadingIndicator.classList.remove('hidden');
    blendForm.querySelector('button').disabled = true;
  } else {
    loadingIndicator.classList.add('hidden');
    blendForm.querySelector('button').disabled = false;
  }
}

function showStatus(message, type = 'error') {
  statusMessage.textContent = message;
  statusMessage.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg max-w-xs ${type === 'error' ? 'bg-red-500' : 'bg-blue-500'} text-white`;
  statusMessage.classList.remove('hidden');
  setTimeout(() => statusMessage.classList.add('hidden'), 5000);
}

function clearStatus() {
  statusMessage.classList.add('hidden');
}

// Event Listeners
blendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user1 = document.getElementById('user1').value.trim();
  const user2 = document.getElementById('user2').value.trim();

  if (!user1 || !user2) {
    return showStatus('Please enter both Last.fm usernames', 'error');
  }

  playlistContainer.classList.add('hidden');
  exportBtn.classList.add('hidden');
  await generatePlaylist(user1, user2);
});

exportBtn.addEventListener('click', exportPlaylist);