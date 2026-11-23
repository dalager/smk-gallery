# Floor plan facts

From `src/lib/layout.js` (`PLAN`, `computeLayout`). All distances in metres. Read
that file if these numbers might have changed.

## Rooms

- Each room is 12 wide (X), 14 deep (Z), 5.5 high, with a skylight over the aisle.
- Rooms run in a line towards −Z, 0.4 m walls between them, doorways 2.6 wide on the
  centre line (x = 0). The entrance is at the +Z end of the first room.
- Room *i* (counting from 0) is centred at z = −14.4 · *i* and spans
  z = centre ± 7.

## Placement

- Two rows of plinths at x = −3.2 (left, walking in) and x = +3.2 (right), each
  piece turned to face the aisle.
- Config order alternates: 1st, 3rd, 5th … on the left; 2nd, 4th, 6th … on the right.
- Each side's pieces are spread evenly over the room's depth: with *n* on a side,
  each gets 14 / *n* m of wall and stands at the middle of its share, the first
  nearest the entrance.
- Because the piece faces the aisle, its **width runs along the wall** and its
  **depth points into the room**. Plinths add 0.12 m on every side.
- Plinth height is set from the piece's height: tall plinths for busts, low for
  statues (`plinthHeightFor`).

Rules of thumb: up to 4 pieces a side (8 a room) for life-size statues; very wide
pieces (the Dying Gaul, 1.85 m; groups such as Laocoön) want a side to themselves or
one neighbour. A piece deeper than about 2.5 m crowds the aisle.

## Camera positions for `?cam=x,z,yaw`

Yaw in degrees: 0 looks down the gallery (−Z), 90 looks left (−X), −90 right, 180
back towards the entrance.

- Room *i* entrance, looking in: `?cam=0,<−14.4·i + 6>,0`
- In front of a left-hand piece at *z*: `?cam=-0.8,<z>,90`
- In front of a right-hand piece at *z*: `?cam=0.8,<z>,-90`

## Current rooms

| id | name | wallColor |
|---|---|---|
| greek | Græske guder og atleter | `#2f4a4a` (teal) |
| hellenistic | Hellenistisk drama | `#5a2e2a` (oxblood) |
| rome | Romerne og deres dyr | `#6b5a34` (ochre) |
| egypt | Egypten | `#26364f` (night blue) |
| renaissance | Michelangelo og renæssancen | `#3c3a44` (slate) |
| danish | Dansk skulptur | `#40503a` (moss) |
