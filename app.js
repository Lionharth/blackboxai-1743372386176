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
    const trackLimit = parseInt(document.getElementById('trackLimit').value) || 100;
    const url = `${BASE_URL}?method=user.gettoptracks&user=${username}&period=overall&limit=${trackLimit}&api_key=${API_KEY}&format=json`;
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
function processTrackData(track, isCommon = false, user1 = false, user2 = false) {
  const artistName = typeof track.artist === 'object' ? track.artist?.name : track.artist;
  const playcount = parseInt(track.playcount) || 0;
  
  // Skip tracks with less than 20 plays
  if (playcount < 20) return null;

  return {
    name: track.name || 'Unknown Track',
    user1,
    user2,
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

    const playlistLength = parseInt(document.getElementById('playlistLength').value) || 50;
    
    let user1Top, user2Top;
    
    if (document.getElementById('advancedMode').checked) {
      const playlistLength = parseInt(document.getElementById('playlistLength').value) || 50;
      const blendedTracks = await getAdvancedBlend(user1, user2, playlistLength);
      displayPlaylist(blendedTracks);
      showLoading(false);
      return;
    } else {
      [user1Top, user2Top, user1Suggested, user2Suggested] = await Promise.all([
        getTopTracks(user1),
        getTopTracks(user2),
        getSuggestedTracks(user1),
        getSuggestedTracks(user2)
      ]);
    }

    // Process all track data with weights
    const user1Tracks = document.getElementById('advancedMode').checked 
      ? user1Top 
      : user1Top.toptracks.track.map(t => processTrackData(t, false, true, false)).filter(t => t !== null);
    const user2Tracks = document.getElementById('advancedMode').checked 
      ? user2Top 
      : user2Top.toptracks.track.map(t => processTrackData(t, false, false, true)).filter(t => t !== null);
    
    // Find common tracks and mark them
    const user1RawTracks = document.getElementById('advancedMode').checked 
      ? user1Top 
      : user1Top.toptracks.track;
    const user2RawTracks = document.getElementById('advancedMode').checked 
      ? user2Top 
      : user2Top.toptracks.track;
      
    const commonTracks = findCommonTracks(user1RawTracks, user2RawTracks)
      .map(t => {
        const track = processTrackData(t, true, true, true);
        if (track) {
          // Calculate combined plays for common tracks
          const user1Track = user1RawTracks.find(ut => 
            ut.name.toLowerCase() === t.name.toLowerCase() && 
            (typeof ut.artist === 'object' ? ut.artist?.name : ut.artist).toLowerCase() === 
            (typeof t.artist === 'object' ? t.artist?.name : t.artist).toLowerCase()
          );
          const user2Track = user2RawTracks.find(ut => 
            ut.name.toLowerCase() === t.name.toLowerCase() && 
            (typeof ut.artist === 'object' ? ut.artist?.name : ut.artist).toLowerCase() === 
            (typeof t.artist === 'object' ? t.artist?.name : t.artist).toLowerCase()
          );
          track.combinedPlays = (parseInt(user1Track?.playcount) || 0) + (parseInt(user2Track?.playcount) || 0);
        }
        return track;
      })
      .filter(t => t !== null);

    // Create a balanced blend (inspired by Spotify)
    const blendedTracks = [];
    const maxTracks = playlistLength;
    
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

    // Sort by relevance (common tracks first, then by weighted score)
    uniqueTracks.sort((a, b) => {
      if (a.common !== b.common) return b.common - a.common;
      
      // Calculate weighted scores if in advanced mode
      if (document.getElementById('advancedMode').checked) {
        const aScore = a.playcount * (a.weight || 1);
        const bScore = b.playcount * (b.weight || 1);
        return bScore - aScore;
      }
      
      // Default sort by playcount in basic mode
      return b.playcount - a.playcount;
    });

    // Limit to playlist length (0 means no limit)
    const finalPlaylist = maxTracks > 0 ? uniqueTracks.slice(0, maxTracks) : uniqueTracks;
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
  playlistDiv.innerHTML = tracks.filter(track => track !== null).map(track => `
    <div class="track-item p-3 mb-2 rounded-lg fade-in ${track.common ? 'common-track' : 'bg-gray-50'}">
      <div class="flex items-center">
        ${track.common ? '<span class="text-yellow-500 mr-2"><i class="fas fa-star"></i></span>' : ''}
        <div class="flex-grow">
          <span class="font-semibold text-gray-800">${track.name}</span>
          <span class="text-gray-600"> - ${track.artist}</span>
          ${track.user1 ? `<span class="text-sm text-blue-500 ml-2">${document.getElementById('user1').value.trim()}</span>` : ''}
          ${track.user2 ? `<span class="text-sm text-green-500 ml-2">${document.getElementById('user2').value.trim()}</span>` : ''}
        </div>
        <span class="text-sm text-gray-500">${track.combinedPlays || track.playcount} plays</span>
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

// Toggle advanced options
document.getElementById('advancedMode').addEventListener('change', function() {
  document.getElementById('advancedOptions').classList.toggle('hidden', !this.checked);
});

// Advanced mode track processing
async function getAdvancedBlend(user1, user2) {
  // Get tracks from different time periods
  const [user1Week, user2Week, user1Month, user2Month, 
         user1Year, user2Year, user1Suggested, user2Suggested] = await Promise.all([
    getTopTracksForPeriod(user1, '7day', 50),
    getTopTracksForPeriod(user2, '7day', 50),
    getTopTracksForPeriod(user1, '1month', 100),
    getTopTracksForPeriod(user2, '1month', 100),
    getTopTracksForPeriod(user1, '12month', 200),
    getTopTracksForPeriod(user2, '12month', 200),
    getSuggestedTracks(user1),
    getSuggestedTracks(user2)
  ]);

  // Find common tracks in each period
  const commonWeek = findCommonTracks(user1Week.toptracks.track, user2Week.toptracks.track);
  const commonMonth = findCommonTracks(user1Month.toptracks.track, user2Month.toptracks.track);
  const commonYear = findCommonTracks(user1Year.toptracks.track, user2Year.toptracks.track);
  const commonSuggested = findCommonTracks(
    user1Suggested.weeklytrackchart.track, 
    user2Suggested.weeklytrackchart.track
  );

  // Process and mark common tracks
  const blendedTracks = [
    ...commonWeek.map(t => processTrackData(t, true, true, true)),
    ...commonMonth.map(t => processTrackData(t, true, true, true)),
    ...commonYear.map(t => processTrackData(t, true, true, true)),
    ...commonSuggested.map(t => processTrackData(t, true, true, true))
  ].filter(t => t !== null);

  // Get all-time tracks for filling remaining slots
  const [user1AllTime, user2AllTime] = await Promise.all([
    getTopTracksForPeriod(user1, 'overall'),
    getTopTracksForPeriod(user2, 'overall')
  ]);

  // Add all-time tracks using normal blending logic
  const user1Tracks = user1AllTime.toptracks.track
    .map(t => processTrackData(t, false, true, false))
    .filter(t => t !== null);
  const user2Tracks = user2AllTime.toptracks.track
    .map(t => processTrackData(t, false, false, true))
    .filter(t => t !== null);
  
  // Get playlist length from UI
  const playlistLength = parseInt(document.getElementById('playlistLength').value) || 50;
  
  // Alternate between users' top all-time tracks
  const maxAllTimeTracks = Math.max(0, playlistLength - blendedTracks.length);
  for (let i = 0; i < maxAllTimeTracks; i++) {
    if (i < user1Tracks.length) blendedTracks.push(user1Tracks[i]);
    if (i < user2Tracks.length) blendedTracks.push(user2Tracks[i]);
  }

  // Remove duplicates while preserving order
  const uniqueTracks = [];
  const trackSet = new Set();
  
  blendedTracks.forEach(track => {
    const key = `${track.nameLower}-${track.artistLower}`;
    if (!trackSet.has(key)) {
      trackSet.add(key);
      uniqueTracks.push(track);
    }
  });

  return uniqueTracks;
}

async function getTopTracksForPeriod(username, period) {
  const trackLimit = parseInt(document.getElementById('trackLimit').value) || 100;
  const url = `${BASE_URL}?method=user.gettoptracks&user=${username}&period=${period}&limit=${trackLimit}&api_key=${API_KEY}&format=json`;
  const response = await fetch(url);
  return response.json();
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