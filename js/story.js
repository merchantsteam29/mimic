// Story modes. Solo: "Ellie", five chapters that unlock in order (saved on this device; it's story
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

// Story progress: how many solo chapters are finished (saved on this device only).
export function storyProgress() {
  try { return Math.max(0, Math.min(CHAPTERS.length, Number(localStorage.getItem('mimic.story')) || 0)); } catch { return 0; }
}
export function finishChapter(i) {
  try { if (i + 1 > storyProgress()) localStorage.setItem('mimic.story', String(i + 1)); } catch { /* private mode */ }
}
