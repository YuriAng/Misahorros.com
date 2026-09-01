--
-- PostgreSQL database dump
--

\restrict S6Qef774CuyXYypxfc9GInESkT5bOKQB2DDr3c06deov9uovX0VzgGfjvBoam9u

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id text NOT NULL,
    name text NOT NULL,
    icon text DEFAULT '💸'::text NOT NULL,
    color text DEFAULT '#4F8EF7'::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT categories_name_not_blank CHECK ((length(btrim(name)) > 0))
);


--
-- Name: category_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_budgets (
    month_key text NOT NULL,
    category_id text NOT NULL,
    amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    CONSTRAINT category_budgets_amount_nonnegative CHECK ((amount >= (0)::numeric))
);


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: months; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.months (
    month_key text NOT NULL,
    income_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    income_updated_at timestamp with time zone,
    CONSTRAINT months_month_key_format CHECK ((month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text))
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    month_key text NOT NULL,
    category_id text NOT NULL,
    amount numeric(14,2) NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    date timestamp with time zone NOT NULL
);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, icon, color, archived, created_at) FROM stdin;
cat_5c33cd82	Alimentacion	🥗	#22c55e	f	2026-08-31 22:41:58.291334+00
cat_d907ea15	Salud	🩺	#4f8ef7	f	2026-08-31 22:42:17.857228+00
cat_7f5283df	Gatos	🐈‍⬛	#64748b	f	2026-08-31 22:42:37.433778+00
cat_89b3b683	Hogar	🏠	#22c55e	f	2026-08-31 22:44:06.337418+00
cat_93e22228	Condominio	🏡	#14b8a6	f	2026-08-31 22:45:01.832227+00
cat_cdf06dd0	Salida	🎡	#ec4899	f	2026-08-31 22:47:31.328534+00
cat_af49ebc5	Pagos Digitales	🫆	#4239d2	f	2026-08-31 22:48:20.456282+00
cat_25655c96	Diezmo	💸	#64748b	f	2026-08-31 22:49:32.305546+00
cat_94973c8e	Yuri	🙎🏽	#a855f7	f	2026-08-31 22:53:43.639221+00
cat_0d227edc	Agueda	👵🏽	#ec4899	f	2026-08-31 22:55:56.593512+00
cat_5416bc2a	Ahorros	🪎	#4f8ef7	f	2026-08-31 22:50:35.181722+00
\.


--
-- Data for Name: category_budgets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.category_budgets (month_key, category_id, amount) FROM stdin;
2026-09	cat_5c33cd82	400.00
2026-08	cat_5c33cd82	0.00
2026-09	cat_d907ea15	160.00
2026-08	cat_d907ea15	0.00
2026-09	cat_7f5283df	50.00
2026-08	cat_7f5283df	0.00
2026-09	cat_89b3b683	150.00
2026-08	cat_89b3b683	0.00
2026-09	cat_93e22228	50.00
2026-08	cat_93e22228	0.00
2026-09	cat_cdf06dd0	150.00
2026-08	cat_cdf06dd0	0.00
2026-09	cat_af49ebc5	65.00
2026-08	cat_af49ebc5	0.00
2026-09	cat_25655c96	280.00
2026-08	cat_25655c96	0.00
2026-09	cat_5416bc2a	372.00
2026-08	cat_5416bc2a	0.00
2026-09	cat_94973c8e	156.00
2026-08	cat_94973c8e	0.00
2026-09	cat_0d227edc	207.00
2026-08	cat_0d227edc	0.00
\.


--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.knex_migrations (id, name, batch, migration_time) FROM stdin;
1	001_init.js	1	2026-08-31 22:39:23.109+00
\.


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.knex_migrations_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: months; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.months (month_key, income_amount, income_updated_at) FROM stdin;
2026-09	2040.00	2026-09-01 13:02:29.715382+00
2026-08	0.00	2026-09-01 13:02:29.747418+00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (key, value) FROM stdin;
active_month	2026-09
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, month_key, category_id, amount, note, date) FROM stdin;
txn_acbe74d6	2026-09	cat_cdf06dd0	18.00	Boulevard	2026-09-01 23:19:12.451+00
txn_a6eb00c7	2026-09	cat_cdf06dd0	9.50	9.5	2026-09-01 23:18:55.953+00
txn_fa9f87c3	2026-09	cat_94973c8e	5.50	Chuches mexicanas	2026-09-01 23:17:19.279+00
txn_d91bb667	2026-09	cat_7f5283df	13.00	Gatarina	2026-09-01 23:16:42.917+00
txn_ddae2cfa	2026-09	cat_89b3b683	15.00	15	2026-09-01 23:16:28.356+00
txn_6a5fd101	2026-09	cat_89b3b683	7.50	Limpotex	2026-09-01 23:16:10.188+00
txn_0d8e5f4b	2026-09	cat_89b3b683	42.50	Limpieza aires	2026-09-01 23:15:53.367+00
txn_8ed0abe5	2026-09	cat_5c33cd82	1.00	Tulipan	2026-09-01 23:15:21.77+00
txn_5c3772b1	2026-09	cat_5c33cd82	10.00	Rio	2026-09-01 23:15:14.68+00
txn_278c8501	2026-09	cat_5c33cd82	49.00	Pollera	2026-09-01 23:15:00.16+00
txn_570c662f	2026-09	cat_94973c8e	21.50	Entrada	2026-09-01 23:13:15.231+00
txn_0a2e0582	2026-09	cat_94973c8e	2.50	Movistar	2026-09-01 23:04:53.896+00
txn_efe6d5dd	2026-09	cat_d907ea15	28.00	Farmatodo	2026-09-01 23:04:12.172+00
txn_f5c9c60d	2026-09	cat_89b3b683	2.00	Corpoelec	2026-09-01 23:03:55.663+00
txn_1081c90a	2026-09	cat_5c33cd82	8.50	Yuli	2026-09-01 23:03:34.613+00
\.


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 1, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: category_budgets category_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_pkey PRIMARY KEY (month_key, category_id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: months months_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.months
    ADD CONSTRAINT months_pkey PRIMARY KEY (month_key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions_month_cat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_month_cat_idx ON public.transactions USING btree (month_key, category_id);


--
-- Name: transactions_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_month_idx ON public.transactions USING btree (month_key);


--
-- Name: category_budgets category_budgets_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: category_budgets category_budgets_month_key_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_month_key_foreign FOREIGN KEY (month_key) REFERENCES public.months(month_key) ON DELETE RESTRICT;


--
-- Name: transactions transactions_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_month_key_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_month_key_foreign FOREIGN KEY (month_key) REFERENCES public.months(month_key) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict S6Qef774CuyXYypxfc9GInESkT5bOKQB2DDr3c06deov9uovX0VzgGfjvBoam9u

