INSERT INTO "User"("email","passwordHash","role","createdAt","updatedAt")
VALUES ('admin@example.com','$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','admin',NOW(),NOW())
ON CONFLICT("email") DO NOTHING;

INSERT INTO "Project"("id","name") VALUES ('p1','N Platform'),('p2','N Analytics') ON CONFLICT DO NOTHING;

INSERT INTO "Membership"("userId","projectId","role")
SELECT u.id,'p1','manager' FROM "User" u WHERE u.email='admin@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO "Epoch"("id","name","projectId") VALUES
('e1','Epoch 1: Discovery','p1'),
('e2','Epoch 2: Delivery','p1'),
('e3','Epoch 1: Migration','p2')
ON CONFLICT DO NOTHING;

INSERT INTO "Meeting"("id","title","epochId","slots","pickedSlot","summary","transcript","recording") VALUES
('m1','Kickoff + BRD','e1',ARRAY['10:00','11:00','16:00'],'11:00','Согласовали цели эпохи и критерии acceptance.','PM: Добрый день. Сегодня обсуждаем цели эпохи.', NULL),
('m2','Tech sync','e1',ARRAY['12:00','14:00'],'14:00','Решили сделать журнал версий и автопривязку документов.','Dev: Нужен журнал версий для docs.','https://meet.example.com/recordings/m2.mp4')
ON CONFLICT DO NOTHING;

INSERT INTO "Document"("id","title","epochId","scope","status","version","linkedMeetingId") VALUES
('d1','BRD: Общие требования','e1','all','approved',5,'m1'),
('d2','Tech spec: согласование docs','e1','manager_developer','review',2,'m2')
ON CONFLICT DO NOTHING;

INSERT INTO "Task"("id","title","epochId","status","docQuote") VALUES
('t1','Карта сущностей','e1','todo','BRD v5 §Entity'),
('t2','Flow согласования docs','e1','in_progress','Tech spec v2 §Approval'),
('t3','Автосуммаризация встреч','e1','review','Meeting m2 summary'),
('t4','Релиз эпохи','e1','done','Release checklist')
ON CONFLICT DO NOTHING;

INSERT INTO "TaskDocument"("taskId","documentId") VALUES
('t1','d1'),('t2','d1'),('t2','d2')
ON CONFLICT DO NOTHING;

INSERT INTO "TaskMeeting"("taskId","meetingId") VALUES
('t1','m1'),('t2','m2'),('t3','m2')
ON CONFLICT DO NOTHING;

INSERT INTO "PullRequest"("id","taskId","status") VALUES
('!42','t2','opened'),('!51','t3','merged'),('!57','t4','merged')
ON CONFLICT DO NOTHING;

INSERT INTO "Release"("id","name","epochId","tasksDone","total") VALUES
('r1','Release Epoch 1','e1',3,4)
ON CONFLICT DO NOTHING;

INSERT INTO "Notification"("id","projectId","type","text","entityType","entityId","role","read") VALUES
('n1','p1','doc','@dev changed d2 to review','doc','d2','manager',false),
('n2','p1','pr','PR !42 opened for task t2','pr','!42','developer',false),
('n3','p1','pr','PR !51 merged - task t3 moved to done','pr','!51','developer',false),
('n4','p1','meeting','Summary added to Tech sync meeting','meeting','m2',NULL,false)
ON CONFLICT DO NOTHING;
