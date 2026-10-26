# Mimic: voice recording script

Every tape the player can find, with the file name to save it as. Record each tape as **one file**, all its lines in order,
with a short pause between lines. Put the files in `voices/<folder>/` (folder = the part before the slash) and run
`node tools/stamp.mjs`: any tape with a recording plays it, and the rest keep the old murmur.

- A phone is fine. The game adds the tape hiss, so record somewhere quiet and don't add effects.
- Lines in brackets, like *(Breathing.)*, are directions: act them, don't read them.
- mp3, m4a, ogg, opus, webm or wav all work. Name the file exactly as shown (e.g. `1-2.m4a` in `voices/ellie/`).
- Some tapes end with *the player's own voice*: stop recording before that line. The game plays the player's voice there.

## Cast

- **Ellie** (13 tapes): Early 20s, films haunted places for her channel. Chatty and jokey on the first tapes, then whispering, scared, and finally very calm.
- **Dr. Okafor** (7 tapes): Scientist who built the thing. Careful and clinical at first; by the end, tired and guilty.
- **Staff and strangers** (17 tapes): Ordinary adults who were there before you: nurses, guards, porters, a caretaker. Natural, tired, frightened.
- **Dispatch line** (8 tapes): A 911 dispatcher answering, and whoever is calling. Dana can read the dispatcher parts; the callers are whispery and frightened.
- **Child** (1 tape): A child counting, played by an adult doing a small, soft voice.
- **Dana** (1 tape): The 911 dispatcher (the player in The Operator). Calm, professional, quietly scared.

## Ellie

### `voices/ellie/1-1`  (Chapter 1: The Holloway House)
**Ellie, tape 1** · Ellie

> Okay, chat, we're in. Front hall. It's honestly just an old house. Smells like wet carpet.
>
> Hold on. Did you hear that? Someone just said "hello" upstairs.
>
> That was my voice. That was literally my voice.

### `voices/ellie/1-2`  (Chapter 1: The Holloway House)
**Ellie, tape 2** · Ellie

> Stream's down. No signal. I'm recording on this thing instead.
>
> Every time I talk, the house goes quiet. Like it's listening.
>
> I'm going to stop talking now.

### `voices/ellie/1-3`  (Chapter 1: The Holloway House)
**Ellie, tape 3** · Ellie

> If anyone finds this: it's not a ghost.
>
> It copies you. It says your words back from the next room, so you'll walk in.
>
> I found a key to the cellar. It came up from down there. I'm going down.

### `voices/ellie/2-1`  (Chapter 2: The Cellar)
**Ellie, tape 4** · Ellie

> This is insane. There's a whole building under the house.
>
> Kestrel Laboratories. Wing C. There are lockers. There are beds.
>
> There are a lot of beds.

### `voices/ellie/2-2`  (Chapter 2: The Cellar)
**Dr. Okafor, research log 3** · Dr. Okafor

> Subject continues to vocalise using recordings of staff.
>
> It doesn't understand the words. It understands that we come when called.
>
> Recommend all staff keep silence below the house.

### `voices/ellie/2-3`  (Chapter 2: The Cellar)
**Ellie, tape 5** · Ellie

> It followed me down. I heard it say my name in the stairwell.
>
> Not in my voice this time.
>
> In yours.

### `voices/ellie/3-1`  (Chapter 3: Kestrel Labs)
**Dr. Okafor, research log 9** · Dr. Okafor

> Project MIMIC. The idea was a listener: something that learns any voice from a few seconds of speech.
>
> For search and rescue. Find people by calling them in a voice they trust.
>
> It worked better than anyone wanted.

### `voices/ellie/3-2`  (Chapter 3: Kestrel Labs)
**Dr. Okafor, research log 14** · Dr. Okafor

> It can only use our words. Never new ones.
>
> So when it says a sentence nobody would say, it's stitching our words together.
>
> Yesterday it said "come here, it's safe" in four voices at once.

### `voices/ellie/3-3`  (Chapter 3: Kestrel Labs)
**Dr. Okafor, final log** · Dr. Okafor

> We sealed the labs and built the house on top. People live in houses. People talk in houses.
>
> It doesn't need to come up. It only needs to wait for someone to call down.
>
> God forgive me. We gave it a home.

### `voices/ellie/4-1`  (Chapter 4: Wing C)
**Ellie, tape 6** · Ellie

> I'm in a locker. It walked past twice.
>
> It keeps saying "I'm coming, Ellie." In your voice.
>
> You've never said that to me. Not in your life. Where did it hear you?

### `voices/ellie/4-2`  (Chapter 4: Wing C)
**Night guard, shift four** · Staff and strangers

> Something keeps buzzing the intercom, saying my name. In my own voice.
>
> I never told it my name. I said it on the radio once.
>
> It listens to the radio. It listens to the phones.

### `voices/ellie/4-3`  (Chapter 4: Wing C)
**Ellie, tape 7** · Ellie

> It listens to the phones.
>
> I called you from the car before I went in. You didn't pick up. I left a message.
>
> It's been playing my message back to you, hasn't it.

### `voices/ellie/5-1`  (Chapter 5: Ellie)
**Ellie, tape 8** · Ellie

> If you're hearing this, you came. I knew you would.
>
> Don't trust anything that sounds like me.
>
> Don't trust anything that sounds like you.

### `voices/ellie/5-2`  (Chapter 5: Ellie)
**Ellie, tape 9** · Ellie

> It doesn't want me. It wants voices. More voices. New ones.
>
> That's why it let me leave you messages.
>
> I'm the bait. I'm so sorry.

### `voices/ellie/5-3`  (Chapter 5: Ellie)
**Ellie, last tape** · Ellie

> This is the last one. It's right outside.
>
> If it's you out there... say something only you would say.

*(Stop here: the player's own voice plays next.)*

### `voices/ellie/6-1`  (Chapter 6: St. Agnes)
**Nurse Adeyemi, ward notes** · Staff and strangers

> Bed 12 still not speaking. When I say good morning, she says good morning back. In my voice.
>
> Not like me. In my voice. I had to sit down.
>
> Dr. Hale says it's trauma. Dr. Hale hasn't heard her do his.

### `voices/ellie/6-2`  (Chapter 6: St. Agnes)
**Night porter, intercom log** · Staff and strangers

> Three a.m. Bed 12 is empty. Window shut, door locked from the outside.
>
> But I can still hear her in there, saying "Is anybody there?"
>
> In the voice of the woman in bed 11. Who died on Tuesday.

### `voices/ellie/6-3`  (Chapter 6: St. Agnes)
**Ellie, tape 10** · Ellie

> It's me. The real me. I'm in the walls, in the service ducts. I got out of that bed before it did.
>
> It came out of the house wearing me. It wanted to be somewhere with more people. More voices.
>
> Hospitals are full of voices. Nobody thinks it's strange when someone calls out at night.

### `voices/ellie/7-1`  (Chapter 7: The Morgue)
**Coroner's log, drawer 9** · Staff and strangers

> Admitted: unknown female, found in the service duct. No pulse.
>
> At 2:40 the drawer said "Let me out" in my wife's voice. I have never brought my wife here.
>
> I opened it. It was empty. It has been empty ever since. It keeps asking.

### `voices/ellie/7-2`  (Chapter 7: The Morgue)
**Dr. Okafor, voicemail** · Dr. Okafor

> If you're Ellie's family, I'm sorry. I'm the one who built it, and I'm the one who moved it.
>
> When they shut Kestrel down, they told me to take everything to St. Agnes for "storage". Everything.
>
> The original recordings are still at Kestrel, in the deepest room. Everything it is started there. Wipe them, and it forgets how to be anyone.

### `voices/ellie/7-3`  (Chapter 7: The Morgue)
**Ellie, tape 11** · Ellie

> It doesn't sleep. But it listens to itself for hours, all the voices, over and over. Practising.
>
> I heard it practise yours. It's nearly got it.
>
> I'm going back to Kestrel. Please don't follow me. Please follow me.

### `voices/ellie/8-1`  (Chapter 8: The First Room)
**Recording 0001** · Dispatch line

> Test, test. This is Dr. Okafor, voice sample one. The quick brown fox.
>
> (The same sentence again, in the same voice. Slightly wrong.)
>
> (Again. And again. Each time a little closer.)

### `voices/ellie/8-2`  (Chapter 8: The First Room)
**Recording 0002** · Child

> A child's voice, counting to ten. Okafor's daughter, visiting the lab one Saturday.
>
> It learned to count from her. It still counts, when it's waiting for someone.
>
> You've heard it counting. You didn't know what it was.

### `voices/ellie/8-3`  (Chapter 8: The First Room)
**Ellie, tape 12** · Ellie

> I'm in the first room. I wiped the last of its tapes. It's angry now. It can't remember how to be most of them.
>
> It still has you. It still has me. We're the newest, and it remembers the newest best.
>
> When you find me, ask me what you called me when we were kids. It never heard that. Nobody ever recorded it.

## The Operator

### `voices/operator/1-1`  (Chapter 1: The Call)
**911 call, 2:13 a.m.** · Dispatch line

> Holloway County 911, what is the address of your emergency?
>
> (Breathing.) St. Agnes. Ward 4. It's in here with me.
>
> Ma'am, St. Agnes is closed. Ma'am? (The line goes dead.)

### `voices/operator/1-2`  (Chapter 1: The Call)
**Night porter's phone, last year** · Staff and strangers

> This is the porter. Somebody keeps calling the ward phones from inside the ward.
>
> I pick up, and it's me. Me, asking if anybody's there.
>
> I've stopped picking up.

### `voices/operator/1-3`  (Chapter 1: The Call)
**911 call, 2:51 a.m.** · Dispatch line

> Holloway County 911, what is the address of your emergency?
>
> It's me. I'm still here. Why haven't you come?
>
> (Your own voice says, very quietly:) "I'm coming."

### `voices/operator/2-1`  (Chapter 2: Dispatch)
**Archive reel, 1987** · Dispatch line

> Holloway County 911.
>
> (A child's voice.) There's someone in the house who sounds like Mummy.
>
> But Mummy's here with me. Mummy's holding my hand.

### `voices/operator/2-2`  (Chapter 2: Dispatch)
**Supervisor's memo, read aloud** · Staff and strangers

> Effective immediately: if a caller's voice matches a previous caller's voice exactly, end the call.
>
> Do not dispatch. Do not call back.
>
> Do not, under any circumstances, say your own name on the line.

### `voices/operator/2-3`  (Chapter 2: Dispatch)
**Archive reel, last month** · Dispatch line

> Holloway County 911, this is Dana, what is the address of your emergency?
>
> (Your voice, exactly:) "Holloway County 911, this is Dana."
>
> (Again. And again. Each time a little closer.)

### `voices/operator/3-1`  (Chapter 3: The Payphone)
**School PA log** · Staff and strangers

> The PA keeps switching itself on after hours. No announcement. Just breathing, and a register being read.
>
> It reads the names of every child in the school.
>
> And then it reads my name.

### `voices/operator/3-2`  (Chapter 3: The Payphone)
**911 call, from the payphone** · Dispatch line

> Holloway County 911.
>
> "Dana? Is that Dana? I know your voice. You took my call before."
>
> "You told me to stay on the line. I'm still on the line."

### `voices/operator/3-3`  (Chapter 3: The Payphone)
**Caretaker's answering machine** · Staff and strangers

> If you're hearing this, unplug the phones. All of them.
>
> It learns from the phones. It practises on the phones.
>
> It's leaving. It's found somewhere with more rooms and more phones.

### `voices/operator/4-1`  (Chapter 4: Room 314)
**Front desk, March** · Staff and strangers

> "Front desk." "Hi, this is 314, could I get some towels?" "Of course."
>
> Nobody was checked into 314.
>
> The towels were gone in the morning. The door was locked from the inside.

### `voices/operator/4-2`  (Chapter 4: Room 314)
**Guest's phone message** · Staff and strangers

> Honey, it's me, I'm at the hotel, call me back.
>
> (Then, in the same voice, a minute later:) Honey, it's me, I'm at the hotel, call me back.
>
> (And again. The same breath before every word.)

### `voices/operator/4-3`  (Chapter 4: Room 314)
**911 call, from Room 314** · Dispatch line

> "Holloway County 911, this is Dana, what is the address of your emergency?"
>
> It's your voice asking. It's your voice answering.
>
> "The Westgate Mall. The security office. Come and see what I found."

### `voices/operator/5-1`  (Chapter 5: Hold Music)
**Security guard, night log** · Staff and strangers

> The switchboard rings and rings. When I pick up, I hear my wife calling me for dinner.
>
> My wife died in 2019.
>
> I keep picking up.

### `voices/operator/5-2`  (Chapter 5: Hold Music)
**Recording, unlabelled** · Dispatch line

> (A hundred voices at once, all saying:) "Holloway County 911, what is the address of your emergency?"
>
> (One by one, they drop away, until only one is left.)
>
> (It's yours.)

### `voices/operator/5-3`  (Chapter 5: Hold Music)
**Dana, a message to herself** · Dana

> If you're hearing this, it's me. The real me. I recorded this before I came in.
>
> If it ever calls you in my voice, ask it what we had for breakfast. It wasn't there.

*(Stop here: the player's own voice plays next.)*

## Victims' tapes (any normal run)

### `voices/lore/1`  
**Field team, recorder 2** · Staff and strangers

> Okay. It's recording.
>
> Marcus went ahead to check the pump room.
>
> Marcus? ...He just called me from the stairwell.
>
> But I can see the stairwell from here. It's empty.

### `voices/lore/2`  
**Unlabelled tape, child's handwriting** · Staff and strangers

> If you're hearing this, don't answer when it calls.
>
> It knows Mum's voice now.
>
> It said goodnight to me in her voice.
>
> She's been gone since Tuesday.

### `voices/lore/3`  
**Dr. Okafor, research log 14** · Dr. Okafor

> The specimen responds to speech. It doesn't understand language.
>
> It understands that we come when we're called.
>
> Recommend all staff keep silence below level two.
>
> Nobody listens. They keep talking. It keeps learning.

### `voices/lore/4`  
**Night guard, shift four** · Staff and strangers

> Something keeps buzzing the intercom and saying my name.
>
> In my own voice.
>
> I never told it my name. I said it on the radio once.
>
> It listens to the radio.

### `voices/lore/5`  
**Tape found inside a wardrobe** · Staff and strangers

> There's someone in the other wardrobe.
>
> It breathes when I'm quiet.
>
> When I talk, it stops breathing.
>
> So it can listen.

### `voices/lore/6`  
**Rescue team, channel 3** · Staff and strangers

> Headcount, sound off.
>
> One. Two. Three. Four.
>
> Five.
>
> There are four of us.

### `voices/lore/7`  
**Dr. Okafor, research log 21** · Dr. Okafor

> It can't make new words. Only ours.
>
> So if you hear a sentence nobody would say, like "come here, it's safe",
>
> that's it stitching our words together.
>
> Don't go.

### `voices/lore/8`  
**Unknown** · Staff and strangers

> (breathing)
>
> It's wearing Dana.
>
> It walks like her. It holds the torch like her.
>
> It doesn't blink.
