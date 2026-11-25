### 2026-11-20 - Follow uses displayed bodies and survives inspector death

The pack worker can temporarily leave `createFrameLoop` with its empty placeholder before the first published frame.
A follow controller must distinguish that placeholder from an actual packed frame containing zero agents.
The worker's selection `gone` message describes the inspector subject; clearing `followId` there also cancels a
follow before the displayed death and can interrupt an unrelated automatically followed subject.
Follow interest reads the renderer's existing pursuit pairs and reuses `scoreEffect` on played events. Its bounded
subject ring stays separate from the notable-moment log so individual births do not crowd the off-view pointers.
