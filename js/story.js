// Story modes. Solo: "Ellie", eight chapters; "The Operator", five more (see OPERATOR below); (6-8 happen after she gets out of the house) that unlock in order (saved on this device; it's story
// progress, not a reward). Online: "The Signal", where one of you might be working for it.
//
// Each chapter: a fixed seed and theme, level options (gen: forced objectives, size, darkness), the
// tapes you find (subtitled; required to finish the chapter), and text before and after.

export const CHAPTERS = [
  {
    title: 'The Holloway House', theme: 'house', seed: 1101,
    gen: { size: 22, tasks: { keycard: true }, broken: 0.2 },
    grace: 75, hunger: false,
    intro: [
      'Your sister Ellie went into the Holloway house three weeks ago to film it for her channel.',
      'The stream cut out after forty minutes. The police found her car and her camera bag. Not her.',
      'Her pocket recorder was missing from the bag. If she left you anything, it\'s in there.',
    ],
    tapeLabel: 'Ellie\'s tapes',
    tapes: [
      { who: 'Ellie, tape 1', lines: [
        'Okay, chat, we\'re in. Front hall. It\'s honestly just an old house. Smells like wet carpet.',
        'Hold on. Did you hear that? Someone just said "hello" upstairs.',
        'That was my voice. That was literally my voice.',
      ] },
      { who: 'Ellie, tape 2', lines: [
        'Stream\'s down. No signal. I\'m recording on this thing instead.',
        'Every time I talk, the house goes quiet. Like it\'s listening.',
        'I\'m going to stop talking now.',
      ] },
      { who: 'Ellie, tape 3', lines: [
        'If anyone finds this: it\'s not a ghost.',
        'It copies you. It says your words back from the next room, so you\'ll walk in.',
        'I found a key to the cellar. It came up from down there. I\'m going down.',
      ] },
    ],
    ending: [
      'The cellar door was bolted. From the outside.',
      'Scratched into the wood, in Ellie\'s handwriting: DON\'T ANSWER IT.',
    ],
  },
  {
    title: 'The Cellar', theme: 'facility', seed: 2207,
    gen: { size: 26, tasks: { gens: 2 }, broken: 0.35 },
    grace: 55, hunger: false,
    intro: [
      'There is no cellar under the Holloway house. There\'s concrete. Corridors. Signs with a company name.',
      'Somebody built something down here, a long time before Ellie came.',
      'The power is dead. The generators are the only way to see where she went.',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'Ellie, tape 4', lines: [
        'This is insane. There\'s a whole building under the house.',
        'Kestrel Laboratories. Wing C. There are lockers. There are beds.',
        'There are a lot of beds.',
      ] },
      { who: 'Dr. Okafor, research log 3', lines: [
        'Subject continues to vocalise using recordings of staff.',
        'It doesn\'t understand the words. It understands that we come when called.',
        'Recommend all staff keep silence below the house.',
      ] },
      { who: 'Ellie, tape 5', lines: [
        'It followed me down. I heard it say my name in the stairwell.',
        'Not in my voice this time.',
        'In yours.',
      ] },
    ],
    ending: [
      'The generators coughed, and the lights came on all the way down the corridor.',
      'At the far end, a lift. The button for the lowest floor was already pressed.',
    ],
  },
  {
    title: 'Kestrel Labs', theme: 'facility', seed: 3313,
    gen: { size: 32, tasks: { fuses: true, tapes: 3 } },
    grace: 45, hunger: true,
    intro: [
      'The labs go on forever. Every door has a name stencilled on it. Every room has a tape recorder, still running.',
      'They recorded everything it said. Then it started recording them.',
      'Smash its tapes. Find out what they made.',
    ],
    tapeLabel: 'Research logs',
    tapes: [
      { who: 'Dr. Okafor, research log 9', lines: [
        'Project MIMIC. The idea was a listener: something that learns any voice from a few seconds of speech.',
        'For search and rescue. Find people by calling them in a voice they trust.',
        'It worked better than anyone wanted.',
      ] },
      { who: 'Dr. Okafor, research log 14', lines: [
        'It can only use our words. Never new ones.',
        'So when it says a sentence nobody would say, it\'s stitching our words together.',
        'Yesterday it said "come here, it\'s safe" in four voices at once.',
      ] },
      { who: 'Dr. Okafor, final log', lines: [
        'We sealed the labs and built the house on top. People live in houses. People talk in houses.',
        'It doesn\'t need to come up. It only needs to wait for someone to call down.',
        'God forgive me. We gave it a home.',
      ] },
    ],
    ending: [
      'The last log ended with a woman\'s voice. Not Okafor\'s.',
      'Ellie, very quietly: "Wing C. I\'m in Wing C. Please hurry."',
    ],
  },
  {
    title: 'Wing C', theme: 'facility', seed: 4421,
    gen: { size: 34, tasks: { gens: 2, fuses: true, keycard: true }, broken: 0.45 },
    grace: 35, hunger: true,
    intro: [
      'Wing C is where they kept it. The doors were built to be closed from the outside.',
      'You can hear Ellie. Somewhere ahead, calling your name, over and over, in exactly the same way.',
      'Exactly the same way every time.',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'Ellie, tape 6', lines: [
        'I\'m in a locker. It walked past twice.',
        'It keeps saying "I\'m coming, Ellie." In your voice.',
        'You\'ve never said that to me. Not in your life. Where did it hear you?',
      ] },
      { who: 'Night guard, shift four', lines: [
        'Something keeps buzzing the intercom, saying my name. In my own voice.',
        'I never told it my name. I said it on the radio once.',
        'It listens to the radio. It listens to the phones.',
      ] },
      { who: 'Ellie, tape 7', lines: [
        'It listens to the phones.',
        'I called you from the car before I went in. You didn\'t pick up. I left a message.',
        'It\'s been playing my message back to you, hasn\'t it.',
      ] },
    ],
    ending: [
      'Wing C was empty. Her recorder was on the floor of the last cell, still running.',
      'The only way out is back up through the house.',
    ],
  },
  {
    title: 'Ellie', theme: 'house', seed: 5527,
    gen: { size: 28, tasks: { fuses: true, gens: 2, tapes: 3 }, broken: 0.55 },
    grace: 25, hunger: true,
    intro: [
      'You came up through the cellar. The house is the same, but it\'s darker. The walls are closer.',
      'Ellie is calling from upstairs. From the kitchen. From right behind you.',
      'Get the power on and get out through the front door. Whatever it says. Whoever it sounds like.',
    ],
    tapeLabel: 'Ellie\'s last tapes',
    tapes: [
      { who: 'Ellie, tape 8', lines: [
        'If you\'re hearing this, you came. I knew you would.',
        'Don\'t trust anything that sounds like me.',
        'Don\'t trust anything that sounds like you.',
      ] },
      { who: 'Ellie, tape 9', lines: [
        'It doesn\'t want me. It wants voices. More voices. New ones.',
        'That\'s why it let me leave you messages.',
        'I\'m the bait. I\'m so sorry.',
      ] },
      { who: 'Ellie, last tape', lines: [
        'This is the last one. It\'s right outside.',
        'If it\'s you out there... say something only you would say.',
        { playerClip: true, text: '(your voice) "I found something. Come here."' },
      ] },
    ],
    ending: [
      'The front door opens onto a grey morning. You don\'t look back.',
      'In the car, your phone buzzes. A voice message, from Ellie\'s number.',
      'You play it.',
      { playerClip: true, text: 'It\'s your voice.' },
    ],
  },
  // ---------- after: St. Agnes ----------
  {
    title: 'St. Agnes', theme: 'hospital', seed: 6631,
    gen: { size: 28, tasks: { fuses: true, keycard: true }, broken: 0.35 },
    grace: 40, hunger: true,
    intro: [
      'Three weeks later, the hospital calls. A girl was found walking along the road near the Holloway house, barefoot, in the rain.',
      'She won\'t say her name. She won\'t say anything of her own. She only repeats what the nurses say to her.',
      'St. Agnes, Ward 4, bed 12. You get there after midnight. The power is out, and the ward is empty.',
    ],
    tapeLabel: 'Ward 4 notes',
    tapes: [
      { who: 'Nurse Adeyemi, ward notes', lines: [
        'Bed 12 still not speaking. When I say good morning, she says good morning back. In my voice.',
        'Not like me. In my voice. I had to sit down.',
        'Dr. Hale says it\'s trauma. Dr. Hale hasn\'t heard her do his.',
      ] },
      { who: 'Night porter, intercom log', lines: [
        'Three a.m. Bed 12 is empty. Window shut, door locked from the outside.',
        'But I can still hear her in there, saying "Is anybody there?"',
        'In the voice of the woman in bed 11. Who died on Tuesday.',
      ] },
      { who: 'Ellie, tape 10', lines: [
        'It\'s me. The real me. I\'m in the walls, in the service ducts. I got out of that bed before it did.',
        'It came out of the house wearing me. It wanted to be somewhere with more people. More voices.',
        'Hospitals are full of voices. Nobody thinks it\'s strange when someone calls out at night.',
      ] },
    ],
    ending: [
      'Bed 12 is empty. On the pillow, Ellie\'s recorder, still warm.',
      'The hospital speakers crackle on. A calm voice, a nurse\'s voice: "Visitor for bed 12. Please come down to the morgue."',
    ],
  },
  {
    title: 'The Morgue', theme: 'hospital', seed: 7741,
    gen: { size: 24, tasks: { gens: 2, tapes: 3 }, broken: 0.55 },
    grace: 30, hunger: true,
    intro: [
      'The basement of St. Agnes is colder than the rest of the hospital, on purpose.',
      'The tape recorders are down here now. It brought them with it. It keeps every voice it has ever taken, and it plays them to itself in the dark.',
      'Get the generators running. Smash its recordings. Somewhere down here, Ellie is keeping very, very quiet.',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'Coroner\'s log, drawer 9', lines: [
        'Admitted: unknown female, found in the service duct. No pulse.',
        'At 2:40 the drawer said "Let me out" in my wife\'s voice. I have never brought my wife here.',
        'I opened it. It was empty. It has been empty ever since. It keeps asking.',
      ] },
      { who: 'Dr. Okafor, voicemail', lines: [
        'If you\'re Ellie\'s family, I\'m sorry. I\'m the one who built it, and I\'m the one who moved it.',
        'When they shut Kestrel down, they told me to take everything to St. Agnes for "storage". Everything.',
        'The original recordings are still at Kestrel, in the deepest room. Everything it is started there. Wipe them, and it forgets how to be anyone.',
      ] },
      { who: 'Ellie, tape 11', lines: [
        'It doesn\'t sleep. But it listens to itself for hours, all the voices, over and over. Practising.',
        'I heard it practise yours. It\'s nearly got it.',
        'I\'m going back to Kestrel. Please don\'t follow me. Please follow me.',
      ] },
    ],
    ending: [
      'Drawer 9 is open. Inside, scratched into the steel: KESTREL. THE FIRST ROOM.',
      'From the corridor behind you, perfectly, in your own voice: "Wait for me."',
    ],
  },
  {
    title: 'The First Room', theme: 'facility', seed: 8853,
    gen: { size: 34, tasks: { fuses: true, gens: 2, tapes: 3, keycard: true }, broken: 0.5 },
    grace: 20, hunger: true,
    intro: [
      'Kestrel Labs, the lowest floor. The lift was waiting for you with its doors open.',
      'Behind a locked door at the end of the wing is the first room: the first recordings, the first voices it ever learned.',
      'Wipe them all, get the power on, and find your sister. Then get out, both of you. If it\'s really both of you.',
    ],
    tapeLabel: 'The first recordings',
    tapes: [
      { who: 'Recording 0001', lines: [
        { by: 'Dr. Okafor', text: 'Test, test. This is Dr. Okafor, voice sample one. The quick brown fox.' },
        { by: 'Dr. Okafor, copied', text: '(flat, a little wrong) Test, test. This is Dr. Okafor, voice sample one.' },
        { by: 'Dr. Okafor, copied', text: '(almost perfect now, slowly) The quick brown fox.' },
      ] },
      { who: 'Recording 0002 · Okafor\'s daughter', lines: [
        '(a young girl, counting slowly) One. Two. Three. Four. Five.',
        'Six. Seven. Eight. Nine.',
        '(whispering) Ten. Ready or not.',
      ] },
      { who: 'Ellie, tape 12', lines: [
        'I\'m in the first room. I wiped the last of its tapes. It\'s angry now. It can\'t remember how to be most of them.',
        'It still has you. It still has me. We\'re the newest, and it remembers the newest best.',
        'When you find me, ask me what you called me when we were kids. It never heard that. Nobody ever recorded it.',
      ] },
    ],
    ending: [
      'She\'s in the last room, with her back to the wall and her hands over her mouth.',
      'You ask her. She tells you. Nobody ever recorded it. It\'s really her.',
      'You walk out together into the morning. Behind you, in the dark, in both of your voices, it goes on practising.',
    ],
  },
];

// Online story: one of you might be working for it.
export const SIGNAL = {
  title: 'The Signal',
  intro: [
    'Last night a distress call came in from Site-9. Four voices, begging for help.',
    'Your voices. None of you have ever been there.',
    'Get in, get the power on, get out together. And watch each other: one of you might already belong to it.',
  ],
};

// ---------- the second story: The Operator ----------
// Dana Reyes, a 911 dispatcher for Holloway County. The calls come in at night, from places that have been closed for
// years, in a voice she knows. Its lures sound like a phone line (voice style 'phone').
export const OPERATOR = [
  {
    title: 'The Call', theme: 'hospital', seed: 9101,
    gen: { size: 24, tasks: { fuses: true }, broken: 0.35 },
    grace: 70, hunger: false,
    intro: [
      'Holloway County 911, 2:13 a.m. You\'re the only one on shift. The line lights up: St. Agnes Hospital, Ward 4.',
      'St. Agnes has been closed for a year. The caller is whispering: "Please. It\'s in here with me. Please come."',
      'You know the voice. You can\'t place it. You get in your car.',
    ],
    tapeLabel: 'Call recordings',
    tapes: [
      { who: '911 call, 2:13 a.m.', lines: [
        { by: 'Dispatcher', text: 'Holloway County 911, what is the address of your emergency?' },
        { by: 'Caller', text: '(breathing hard, whispering) St. Agnes. Ward 4. It\'s in here with me.' },
        { by: 'Dispatcher', text: 'Ma\'am, St. Agnes is closed. Ma\'am?' },
      ] },
      { who: 'Night porter\'s phone, last year', lines: [
        'This is the porter. Somebody keeps calling the ward phones from inside the ward.',
        'I pick up, and it\'s me. Me, asking if anybody\'s there.',
        'I\'ve stopped picking up.',
      ] },
      { who: '911 call, 2:51 a.m.', lines: [
        { by: 'Dispatcher', text: 'Holloway County 911, what is the address of your emergency?' },
        { by: 'Caller', text: '(whispering) It\'s me. I\'m still here. Why haven\'t you come?' },
        { by: 'Dana', text: '(very quietly) I\'m coming.' },
      ] },
    ],
    ending: [
      'The ward phone is off its hook, swinging on its cord. Something on the other end is breathing.',
      'You pick it up. A recording: your own voice, from the dispatch desk, an hour ago. "I\'m coming."',
    ],
  },
  {
    title: 'Dispatch', theme: 'facility', seed: 9203,
    gen: { size: 26, tasks: { gens: 2, tapes: 3 }, broken: 0.4 },
    grace: 55, hunger: false,
    intro: [
      'Under the dispatch centre there are three floors nobody uses: the old call archive. Every 911 call since 1971, on tape.',
      'Tonight the archive is running. The reels are turning on their own, playing old calls into empty rooms.',
      'It\'s been listening to the calls for years. Every frightened voice in the county. Find out how long.',
    ],
    tapeLabel: 'Archive reels',
    tapes: [
      { who: 'Archive reel, 1987', lines: [
        { by: 'Dispatcher', text: 'Holloway County 911.' },
        { by: 'Child', text: '(a small, scared child) There\'s someone in the house who sounds like Mummy.' },
        { by: 'Child', text: 'But Mummy\'s here with me. Mummy\'s holding my hand.' },
      ] },
      { who: 'Supervisor\'s memo, read aloud', lines: [
        'Effective immediately: if a caller\'s voice matches a previous caller\'s voice exactly, end the call.',
        'Do not dispatch. Do not call back.',
        'Do not, under any circumstances, say your own name on the line.',
      ] },
      { who: 'Archive reel, last month', lines: [
        { by: 'Dana', text: 'Holloway County 911, this is Dana, what is the address of your emergency?' },
        { by: 'Dana, copied', text: '(flat, a little wrong) Holloway County 911, this is Dana.' },
        { by: 'Dana, copied', text: '(almost perfect now) Holloway County 911. This is Dana.' },
      ] },
    ],
    ending: [
      'The last reel has your name on the label in handwriting you don\'t recognise.',
      'On the desk, the dispatch phone rings. The display says the call is coming from a school.',
    ],
  },
  {
    title: 'The Payphone', theme: 'school', seed: 9307,
    gen: { size: 26, tasks: { fuses: true, keycard: true }, broken: 0.4 },
    grace: 45, hunger: true,
    intro: [
      'Holloway County High. There\'s an old payphone by the gym, and it has been calling 911 every night for a week.',
      'The caller always says the same thing, in the voice of a different child.',
      '"Can you come and get me? It\'s dark and the teacher won\'t stop talking."',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'School PA log', lines: [
        'The PA keeps switching itself on after hours. No announcement. Just breathing, and a register being read.',
        'It reads the names of every child in the school.',
        'And then it reads my name.',
      ] },
      { who: '911 call, from the payphone', lines: [
        { by: 'Dispatcher', text: 'Holloway County 911.' },
        { by: 'Child', text: 'Dana? Is that Dana? I know your voice. You took my call before.' },
        { by: 'Child', text: 'You told me to stay on the line. I\'m still on the line.' },
      ] },
      { who: 'Caretaker\'s answering machine', lines: [
        'If you\'re hearing this, unplug the phones. All of them.',
        'It learns from the phones. It practises on the phones.',
        'It\'s leaving. It\'s found somewhere with more rooms and more phones.',
      ] },
    ],
    ending: [
      'The payphone receiver hangs off the hook. On the other end, a hotel switchboard: "Front desk. How can I help?"',
      'A pause. "Room 314 has been asking for you, Dana."',
    ],
  },
  {
    title: 'Room 314', theme: 'hotel', seed: 9411,
    gen: { size: 28, tasks: { fuses: true, gens: 2 }, broken: 0.5 },
    grace: 35, hunger: true,
    intro: [
      'The Grand Ashby closed in the spring. Every phone in every room still has a dial tone.',
      'Room 314 has called the front desk four hundred times since March.',
      'Go up. Find out what\'s in 314. Don\'t answer the phones. Whatever they say.',
    ],
    tapeLabel: 'Front desk recordings',
    tapes: [
      { who: 'Front desk, March', lines: [
        { by: 'Front desk', text: 'Front desk.' },
        { by: 'Caller', text: '(friendly, ordinary) Hi, this is 314, could I get some towels?' },
        { by: 'Front desk', text: '(later, quietly, to themselves) Nobody was checked into 314. The towels were gone in the morning.' },
      ] },
      { who: 'Guest\'s phone message', lines: [
        'Honey, it\'s me, I\'m at the hotel, call me back.',
        '(exactly the same again, like a replay) Honey, it\'s me, I\'m at the hotel, call me back.',
        '(the same again, slower, flatter) Honey. It\'s me. I\'m at the hotel. Call me back.',
      ] },
      { who: '911 call, from Room 314', lines: [
        { by: 'Dana', text: 'Holloway County 911, this is Dana, what is the address of your emergency?' },
        { by: 'Dana, copied', text: '(calm, in Dana\'s voice) The Westgate Mall. The security office.' },
        { by: 'Dana, copied', text: '(warmly) Come and see what I found.' },
      ] },
    ],
    ending: [
      'Room 314 is empty except for a phone, and dozens of cassettes, every one labelled DANA.',
      'It wasn\'t practising other voices any more. Just one.',
    ],
  },
  {
    title: 'Hold Music', theme: 'mall', seed: 9521,
    gen: { size: 30, tasks: { fuses: true, gens: 2, tapes: 3 }, broken: 0.55 },
    grace: 25, hunger: true,
    intro: [
      'Westgate Mall. The music never stopped. It\'s the hold music from the county phone line.',
      'In the security office, the switchboard routes every phone in Holloway County. All of them ring here first.',
      'Smash its tapes. Turn the power on. Shut the line down. Then get out before it calls you by your name.',
    ],
    tapeLabel: 'Security office tapes',
    tapes: [
      { who: 'Security guard, night log', lines: [
        'The switchboard rings and rings. When I pick up, I hear my wife calling me for dinner.',
        'My wife died in 2019.',
        'I keep picking up.',
      ] },
      { who: 'Recording, unlabelled', lines: [
        { by: 'Dana, copied', text: '(slow and flat) Holloway County 911. What is the address of your emergency?' },
        { by: 'Dana, copied', text: '(whispering) What is the address of your emergency?' },
        { by: 'Dana, copied', text: '(whispering, very close to the mic) Your emergency.' },
      ] },
      { who: 'Dana, a message to herself', lines: [
        'If you\'re hearing this, it\'s me. The real me. I recorded this before I came in.',
        'If it ever calls you in my voice, ask it what we had for breakfast. It wasn\'t there.',
        { playerClip: true, text: '(your voice) "I found something. Come here."' },
      ] },
    ],
    ending: [
      'The switchboard goes dark. For the first time in years, every phone in Holloway County is silent.',
      'You drive back to dispatch as the sun comes up. The night shift log says you took a call at 2:13 a.m.',
      'You listen to the recording. The caller sounds frightened. The caller sounds like you.',
      { playerClip: true, text: 'It\'s your voice.' },
    ],
  },
];

// The Babysitter: a night job in the Hales' big house. The parents keep calling to say they're on their way home. The
// kids keep saying their parents never left. Its lures come in a child's voice (yours, made small).
export const BABYSITTER = [
  {
    title: 'Home by Midnight', theme: 'house', seed: 9501,
    gen: { size: 22, tasks: { fuses: true }, broken: 0.3 },
    grace: 75, hunger: false,
    intro: [
      'The Hales pay double for Saturday nights. You found the job on a card in the post office window: "Babysitter wanted. Two children. Very easy."',
      'Mrs. Hale meets you at the door with her coat already on. "Lily and Sam are asleep. We\'ll be home by midnight. Don\'t go down to the cellar."',
      'At 1 a.m. the lights go out. Upstairs, a small voice says your name.',
    ],
    tapeLabel: 'Messages',
    tapes: [
      { who: 'Answering machine, 11:58 p.m.', lines: [
        { by: 'Mrs. Hale', text: 'Hi, it\'s us. We\'re running a little late, sorry. The roads are awful.' },
        { by: 'Mrs. Hale', text: 'Don\'t let them stay up. And don\'t let them talk you into hide and seek.' },
        { by: 'Mrs. Hale', text: '(a pause, then too brightly) We\'ll be home by midnight.' },
      ] },
      { who: 'Lily\'s toy tape recorder', lines: [
        { by: 'Lily', text: '(a little girl, whispering into the recorder) This is Lily. Mummy and Daddy are playing hide and seek.' },
        { by: 'Lily', text: 'They\'ve been hiding since Tuesday. Sam says they\'re in the cellar.' },
        { by: 'Lily', text: '(giggling) The babysitter has to count.' },
      ] },
      { who: 'Answering machine, 1:14 a.m.', lines: [
        { by: 'Mrs. Hale', text: 'Hi, it\'s us. We\'re running a little late, sorry. The roads are awful.' },
        { by: 'Mrs. Hale', text: '(exactly the same as before, word for word) Don\'t let them stay up.' },
        { by: 'Mrs. Hale', text: '(very close to the phone, no longer bright at all) Don\'t go down to the cellar.' },
      ] },
    ],
    ending: [
      'The children\'s beds are empty, the sheets pulled up neat. On Lily\'s pillow: a drawing of four people holding hands in a dark room.',
      'The phone rings. "Hi, it\'s us. We\'re home." Downstairs, the cellar door is open.',
    ],
  },
  {
    title: 'Hide and Seek', theme: 'house', seed: 9512,
    gen: { size: 26, tasks: { gens: 2, tapes: 3 }, broken: 0.4 },
    grace: 55, hunger: false,
    intro: [
      'The cellar goes further down than the house goes up. Old rooms, papered over. A generator thumping somewhere below.',
      'Somewhere down here, two small voices are counting. They get to ten, and start again.',
      'Find the kids. Don\'t let them find you first.',
    ],
    tapeLabel: 'Baby monitor recordings',
    tapes: [
      { who: 'Baby monitor, the cellar, last Tuesday', lines: [
        { by: 'Mr. Hale', text: '(whispering) Stay behind me. There\'s something down here wearing your voice.' },
        { by: 'Mrs. Hale', text: '(whispering) That\'s not funny, David.' },
        { by: 'Mr. Hale', text: '(whispering, terrified) I didn\'t say anything.' },
      ] },
      { who: 'Sam\'s walkie-talkie', lines: [
        { by: 'Sam', text: '(a small boy, very serious) Sam to Lily. Over.' },
        { by: 'Sam', text: 'Daddy says to stop playing. He says it in the wall. Over.' },
        { by: 'Sam', text: '(after a long pause) Lily, why are you answering from down here? You\'re upstairs. Over.' },
      ] },
      { who: 'Kayla, the last babysitter, a voicemail to her mum', lines: [
        { by: 'Kayla', text: 'Mum, it\'s me. The Hales still aren\'t back and the kids keep saying they never went out.' },
        { by: 'Kayla', text: 'They keep asking me to count. When I count, somebody counts with me.' },
        { by: 'Kayla', text: '(whispering) Can you come and get me? Don\'t call first. It answers the phone.' },
      ] },
    ],
    ending: [
      'In the deepest room there\'s a babysitter\'s bag, a coat, a phone with a hundred missed calls from "Mum". The name on the bag is Kayla.',
      'The hotel the Hales said they were at is printed on a matchbook on the floor. Somebody has circled the room number.',
    ],
  },
  {
    title: 'Room 214', theme: 'hotel', seed: 9523,
    gen: { size: 26, tasks: { fuses: true, keycard: true }, broken: 0.4 },
    grace: 45, hunger: true,
    intro: [
      'The Marlowe Hotel, where Mr. and Mrs. Hale said they were having dinner. The front desk says they never checked in.',
      'They have a room booked anyway. Room 214. Booked every Saturday for a year, in a child\'s handwriting.',
      'The phone in 214 is ringing. It\'s the Hales\' home number.',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'Front desk, Saturday night', lines: [
        'Marlowe front desk. No, nobody named Hale is staying here.',
        'There\'s a little girl on the house phone again, asking for her mummy. She sounds just like you, actually.',
        'I keep putting her through to 214. Nobody\'s in 214.',
      ] },
      { who: 'Room 214, a tape on the bed', lines: [
        { by: 'Mrs. Hale', text: 'If anyone finds this: we never left the house. We went into the cellar and we never came back up.' },
        { by: 'Mrs. Hale', text: 'Whatever\'s calling you in my voice has been practising. It\'s getting very good.' },
        { by: 'Mrs. Hale', text: 'Lily, Sam, if it\'s you listening: don\'t open the door. Not even for me.' },
      ] },
      { who: 'Room 214, the same tape, the other side', lines: [
        { by: 'Lily', text: '(cheerful) Mummy said not to open the door.' },
        { by: 'Lily', text: 'So we didn\'t. We let it in the other way.' },
        { by: 'Sam', text: '(quietly) It says it\'s our babysitter now.' },
      ] },
    ],
    ending: [
      'On the dresser in 214 there\'s a hospital bracelet, a baby\'s, the plastic gone yellow. Name: HALE, LILY. St. Agnes Maternity.',
      'The phone rings once. A child\'s voice: "You\'re getting warmer."',
    ],
  },
  {
    title: 'Night Feeds', theme: 'hospital', seed: 9534,
    gen: { size: 24, tasks: { gens: 2 }, broken: 0.45 },
    grace: 40, hunger: true,
    intro: [
      'St. Agnes. The maternity wing has been shut for years, but the night bell on the nursery still rings at 3 a.m.',
      'The Hales\' children were born here. Eight years apart. On the same night.',
      'Somewhere on the ward, a baby is crying in Lily\'s voice.',
    ],
    tapeLabel: 'Ward recordings',
    tapes: [
      { who: 'Night nurse, a dictated note', lines: [
        'Baby Hale, delivered 2:13 a.m. Healthy girl. She doesn\'t cry like a newborn. She cries like her mother.',
        'When her mother speaks, the baby says it back. Not words. The sound of the words.',
        'I\'ve asked for a transfer to days.',
      ] },
      { who: 'Mr. Hale, a message he never sent', lines: [
        { by: 'Mr. Hale', text: 'We brought two children home from this hospital. We only ever had one.' },
        { by: 'Mr. Hale', text: 'I don\'t know which. They both know our names. They both know the songs.' },
        { by: 'Mr. Hale', text: '(breaking) I love them both. Isn\'t that the worst part.' },
      ] },
      { who: 'The nursery, the night bell', lines: [
        { by: 'Lily', text: '(a sing-song) Mummy\'s gone and Daddy\'s gone and now the babysitter\'s home.' },
        { by: 'Sam', text: '(singing along, flat) Count to ten and close your eyes and never leave us on our own.' },
        { by: 'Lily', text: '(close, whispering) We\'re learning your voice now.' },
      ] },
    ],
    ending: [
      'The nursery cribs have names taped to them: LILY. SAM. KAYLA. And one more, the tape still fresh. Yours.',
      'Your phone rings. "Hi, it\'s us. We\'re home. Where are you? The kids are asking for you."',
    ],
  },
  {
    title: 'The Babysitter', theme: 'house', seed: 9501,
    gen: { size: 22, tasks: { fuses: true, tapes: 3 }, broken: 0.5 },
    grace: 35, hunger: true,
    intro: [
      'Back at the Hale house. Every light is on. The car is in the drive. Through the window you can see a family at the kitchen table: a mother, a father, two children.',
      'And a babysitter, sitting with them, laughing. She looks like you.',
      'Find the real ones. Then get out before morning, or they\'ll need a new babysitter.',
    ],
    tapeLabel: 'Tapes',
    tapes: [
      { who: 'Answering machine, this morning', lines: [
        { by: 'Mrs. Hale', text: 'Hi, it\'s us. We\'re home. Thank you so much for tonight.' },
        { by: 'Mrs. Hale', text: '(warm, and wrong) Same time next Saturday? The children love you.' },
        { by: 'Mrs. Hale', text: '(whispering, the real one, frightened) Please don\'t come back.' },
      ] },
      { who: 'Kayla, from the cellar', lines: [
        { by: 'Kayla', text: '(weak, far away) Hello? Is someone up there? It\'s Kayla. I was the babysitter before you.' },
        { by: 'Kayla', text: 'The Hales are down here with me. Mrs. Hale and Mr. Hale. We\'re all right.' },
        { by: 'Kayla', text: 'The kids aren\'t. The kids were never kids.' },
      ] },
      { who: 'Lily and Sam, the toy recorder, last tape', lines: [
        { by: 'Lily', text: 'This is Lily. We like this babysitter best.' },
        { by: 'Sam', text: 'She talks a lot. We\'ve got nearly all of her now.' },
        { playerClip: true, text: '(your voice) "Hello? Is anyone there?"' },
      ] },
    ],
    ending: [
      'The cellar door opens onto a cold grey morning. Mr. Hale, Mrs. Hale and Kayla climb out behind you, blinking.',
      'Upstairs, two small faces watch from the nursery window. They wave.',
      'From inside the house, very faintly, you hear yourself say goodnight.',
      { playerClip: true, text: 'It\'s your voice.' },
    ],
  },
];

// The solo stories, and where each one's progress is saved (chapters finished, on this device).
export const STORIES = [
  { id: 'ellie', title: 'Ellie', key: 'mimic.story', chapters: CHAPTERS, voice: 'ellie',
    blurb: 'Your sister went into the Holloway house and never came out.', lost: 'Ellie is still in there somewhere.' },
  { id: 'operator', title: 'The Operator', key: 'mimic.story.operator', chapters: OPERATOR, voice: 'phone',
    blurb: 'You\'re a 911 dispatcher. The calls come from places that have been closed for years, in a voice you know.', lost: 'The line is still open.' },
  { id: 'babysitter', title: 'The Babysitter', key: 'mimic.story.babysitter', chapters: BABYSITTER, voice: 'child',
    blurb: 'A Saturday night job in a big house. The parents keep calling to say they\'re on their way home. The kids say they never left.', lost: 'The kids want you to count again.' },
];

// Story progress: how many chapters of a story are finished (saved on this device only).
export function storyProgress(book = STORIES[0]) {
  try { return Math.max(0, Math.min(book.chapters.length, Number(localStorage.getItem(book.key)) || 0)); } catch { return 0; }
}
export function finishChapter(i, book = STORIES[0]) {
  try { if (i + 1 > storyProgress(book)) localStorage.setItem(book.key, String(i + 1)); } catch { /* private mode */ }
}
